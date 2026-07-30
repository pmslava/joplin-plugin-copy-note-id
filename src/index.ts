import joplin from 'api';
import { ToolbarButtonLocation, MenuItemLocation } from 'api/types';

joplin.plugins.register({
	onStart: async function() {
		// Ship a custom toolbar icon: Joplin renders a non-FontAwesome iconName
		// as a <span> carrying that string as a CSS class, so we load a chrome
		// CSS file (bundled in the plugin) that styles that class as our icon.
		const installDir = await joplin.plugins.installationDir();
		await joplin.window.loadChromeCssFile(`${installDir}/toolbar-icon.css`);

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
				const note = await joplin.workspace.selectedNote();
				if (!note) return;
				await joplin.clipboard.writeText(note.id);
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
