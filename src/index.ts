import joplin from 'api';
import { ToolbarButtonLocation, MenuItemLocation, SettingItemType } from 'api/types';

const SETTING_SECTION = 'copyNoteId';
const SETTING_TEMPLATE = 'copyTemplate';

// Copying the bare note ID — the plugin's original behaviour.
const DEFAULT_TEMPLATE = '{note_id}';

// The fields we need to resolve every placeholder.
const NOTE_FIELDS = ['id', 'title', 'is_todo', 'parent_id'];

// Guard against a corrupted parent_id chain looping forever.
const MAX_NOTEBOOK_DEPTH = 100;

interface Note {
	id: string;
	title: string;
	is_todo: number;
	parent_id: string;
}

// {note id}, {Note-Id} and {note_id} should all mean the same thing, so keys
// are lowercased, trimmed, and runs of spaces/underscores/hyphens collapsed
// into a single underscore.
function canonicalKey(rawKey: string): string {
	return rawKey.trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

// The canonical keys a template actually refers to. Used to avoid hitting the
// folders API when no notebook placeholder is present.
function templateKeys(template: string): string[] {
	const keys: string[] = [];
	const regex = /\{([^{}]+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(template)) !== null) {
		keys.push(canonicalKey(match[1]));
	}
	return keys;
}

// Pure: substitutes known placeholders, leaves unknown ones (braces included)
// exactly as they were written. Only own keys count — `in` would also match
// inherited names like `constructor` and paste Object's source on the
// clipboard.
function renderTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{([^{}]+)\}/g, (placeholder, rawKey) => {
		const key = canonicalKey(rawKey);
		return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : placeholder;
	});
}

// Walks the parent_id chain up to the root and returns the notebook titles in
// root-first order, eg. ['Lab', 'Joplin']. A missing notebook should not break
// the copy: a failed lookup just stops the walk and keeps the titles collected
// so far, so a broken ancestor still yields the deepest part of the path.
async function notebookTitlePath(folderId: string): Promise<string[]> {
	const titles: string[] = [];
	let id = folderId;
	for (let hop = 0; hop < MAX_NOTEBOOK_DEPTH && id; hop++) {
		let folder;
		try {
			folder = await joplin.data.get(['folders', id], { fields: ['id', 'title', 'parent_id'] });
		} catch (error) {
			break;
		}
		if (!folder) break;
		titles.unshift(folder.title);
		id = folder.parent_id;
	}
	return titles;
}

// Values for every canonical placeholder. The notebook name/path require an
// extra API round-trip, so they are only resolved when the template asks.
async function placeholderValues(note: Note, keys: string[]): Promise<Record<string, string>> {
	const values: Record<string, string> = {
		note_id: note.id,
		note_title: note.title,
		note_type: note.is_todo ? 'to-do' : 'note',
		note_link: `[${note.title}](:/${note.id})`,
		notebook_id: note.parent_id || '',
	};

	if (keys.indexOf('notebook_name') >= 0 || keys.indexOf('notebook_path') >= 0) {
		const path = note.parent_id ? await notebookTitlePath(note.parent_id) : [];
		values.notebook_name = path.length ? path[path.length - 1] : '';
		values.notebook_path = path.join('/');
	}

	return values;
}

// What a single note contributes to the clipboard.
async function formatNote(note: Note, template: string): Promise<string> {
	const values = await placeholderValues(note, templateKeys(template));
	return renderTemplate(template, values);
}

joplin.plugins.register({
	onStart: async function() {
		// Ship a custom icon: Joplin renders both a command's iconName and a
		// settings section's iconName as CSS classes on the element that draws
		// the icon, so we load a chrome CSS file (bundled in the plugin) that
		// styles those classes as our masked SVG. One file covers both the
		// toolbar button and the Options sidebar entry.
		const installDir = await joplin.plugins.installationDir();
		await joplin.window.loadChromeCssFile(`${installDir}/toolbar-icon.css`);

		// Settings: what gets copied. The default template is the bare note ID,
		// which is the plugin's original behaviour.
		//
		// The config screen drops iconName verbatim into the class list of the
		// <i> it renders for the sidebar entry, so the trailing class is our
		// styling hook and 'fas fa-copy' stays as a fallback: if the chrome CSS
		// ever fails to apply, the generic FontAwesome copy icon shows rather
		// than an empty gap.
		await joplin.settings.registerSection(SETTING_SECTION, {
			label: 'Copy Note ID',
			iconName: 'fas fa-copy copy-note-id-section-icon',
		});

		await joplin.settings.registerSettings({
			[SETTING_TEMPLATE]: {
				value: DEFAULT_TEMPLATE,
				type: SettingItemType.String,
				section: SETTING_SECTION,
				public: true,
				label: 'Copy template',
				description: 'What the copy button puts on the clipboard. Placeholders: {note_id}, {note_title}, {note_type}, {note_link} (markdown link), {notebook_id}, {notebook_name}, {notebook_path} (e.g. Work/Projects). Example: Joplin {note_type} {note_id} copies Joplin to-do 18d76c804e734884953ac22c715bbffb',
			},
		});

		// Register the "Copy note ID" command. Having it as a command means it
		// gets both a toolbar button (below) AND a bindable keyboard shortcut
		// (Options > Keyboard Shortcuts).
		await joplin.commands.register({
			name: 'copyNoteId',
			label: 'Copy note ID',
			iconName: 'copy-note-id-icon',
			// Grey the button out unless exactly one note is selected.
			enabledCondition: 'oneNoteSelected',
			execute: async () => {
				const selected = await joplin.workspace.selectedNote();
				if (!selected) return;

				// Read on every invocation so a change in Options takes effect
				// without restarting Joplin. An empty template would copy an
				// empty string, so fall back to the default.
				const stored: string = await joplin.settings.value(SETTING_TEMPLATE);
				const template = (stored || '').trim() === '' ? DEFAULT_TEMPLATE : stored;

				// Re-read the note through the data API so the fields we need
				// (title, is_todo, parent_id) are always present. The note can
				// disappear between selection and fetch (deleted, or removed by
				// a sync), and data.get rejects rather than returning nothing —
				// there is then nothing to copy, so stop quietly.
				let note: Note;
				try {
					note = await joplin.data.get(['notes', selected.id], { fields: NOTE_FIELDS });
				} catch (error) {
					return;
				}
				if (!note) return;

				// One line per note — the command is limited to a single
				// selected note (see enabledCondition above).
				const lines = [await formatNote(note, template)];
				await joplin.clipboard.writeText(lines.join('\n'));
			},
		});

		// Drop the button into the note's top-right toolbar — the same row as
		// the built-in info (i) and alarm icons.
		await joplin.views.toolbarButtons.create(
			'copyNoteIdButton',
			'copyNoteId',
			ToolbarButtonLocation.NoteToolbar,
		);

		// Menu entries. Registering a menu item is also what makes the command
		// show up in Options > Keyboard Shortcuts (a toolbar button alone does
		// not register it with the keymap service), so a hotkey can be bound.
		// Note menu — natural home + enables the keyboard shortcut.
		await joplin.views.menuItems.create(
			'copyNoteIdMenuItem',
			'copyNoteId',
			MenuItemLocation.Note,
		);
		// Right-click a note in the list to copy its ID without opening it.
		await joplin.views.menuItems.create(
			'copyNoteIdContextMenuItem',
			'copyNoteId',
			MenuItemLocation.NoteListContextMenu,
		);
	},
});
