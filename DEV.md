# Dev launcher (Windows)

Double-click or run from a terminal:

```bat
npm install
npm run rebuild:native
npm run dev
```

## Empty profile for screenshots

To open the app **without your real library** (for marketing screenshots):

```bash
npm run dev:empty
```

Or double-click **`Screenshots.bat`**.

This uses a separate folder `.screenshot-profile` in the project.  
Your normal library stays in `%APPDATA%\IMe Music` and is not changed.

To wipe the empty screenshot profile and start again:

```bat
rmdir /s /q .screenshot-profile
```

Do not use the browser URL from Vite — use the **IMe Music** Electron window.
