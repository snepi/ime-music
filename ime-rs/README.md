# IMe Music (Rust)

Rust rewrite of IMe Music. It lives in `ime-rs/` next to the Electron app and does not replace it.

The interface uses the same stylesheet and the same screen structure: home, library, wishlist, history, recommendations, and the settings tabs (appearance, behavior, hotkeys, tools). Library data is stored in `ime-rs/data/` and is not committed.

## Run

```bash
cd ime-rs
cargo run
```

Open http://127.0.0.1:4173

```bash
IME_RS_PORT=4173 IME_RS_DATA=./data cargo run
```

Import audio with **Файлы** / **Папки**, or post a directory path:

```bash
curl -X POST http://127.0.0.1:4173/import-path -d 'path=/absolute/path/to/music'
```

Playback, likes, playlists, history, search, sort, theme, language, and the settings screens are handled by the Rust server. A short `player.js` only drives the browser audio element.
