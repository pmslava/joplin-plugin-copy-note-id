# Copy Note ID

A tiny [Joplin](https://joplinapp.org) plugin that adds a one-click **Copy note ID**
button to the note toolbar — no more opening *Note properties → Copy ID*.

![The Copy note ID button in the note toolbar](https://raw.githubusercontent.com/pmslava/joplin-plugin-copy-note-id/main/images/screenshot.png)

## Features

- **Toolbar button** in the note's top-right toolbar (next to the info and alarm icons).
- **Note menu** entry — *Note → Copy note ID*.
- **Right-click a note** in the note list → *Copy note ID* (grab an ID without even opening the note).
- **Keyboard shortcut** — bind your own under *Options → Keyboard Shortcuts* (search "Copy note ID").

One click (or key press) puts the current note's ID on your clipboard, ready to paste.

## Install

**From the Joplin plugin store:** *Tools → Options → Plugins*, search **Copy Note ID**, and click *Install*.

**From file:** grab the latest `.jpl` and use *Tools → Options → Plugins → the gear icon → Install from file*.

## Build from source

```bash
npm install
npm run dist
```

The packaged plugin is written to `publish/io.github.copynoteid.jpl`.

## License

[MIT](LICENSE)
