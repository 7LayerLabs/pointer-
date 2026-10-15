# Installing VibeDeck on a new PC

About 10 minutes the first time. After that, opening VibeDeck is a double-click.

This guide is for Windows. On a Mac, follow the same steps, then see [MAC-SETUP.md](MAC-SETUP.md) for the Mac-specific parts.

## What you need first

| Tool | Why | Check it's installed |
| --- | --- | --- |
| Node.js 22 or newer (24 LTS recommended) | Runs VibeDeck | `node -v` |
| Git | Downloads the code, and powers Review and checkpoints | `git --version` |
| At least one AI CLI: Claude Code, Codex, or Grok | The agents VibeDeck drives | `claude --version`, `codex --version` |

Install anything that's missing:

1. **Node.js:** download the LTS installer from https://nodejs.org and run it. Keep the default options.
2. **Git:** download from https://git-scm.com/download/win and run it. Keep the default options.
3. **The AI CLIs.** Open PowerShell and run:

   ```powershell
   npm i -g @anthropic-ai/claude-code @openai/codex
   ```

   Grok is optional. Install the Grok CLI from x.ai if you use it. On Windows it lives in `%USERPROFILE%\.grok\bin\grok.exe`, which is where VibeDeck looks for it.

4. **Sign in to each CLI once.** Run `claude`, sign in with your normal account, then quit with Ctrl+C. Do the same with `codex` (and `grok`). VibeDeck uses these same sign-ins, so the plans and usage are the same as on your other PC.

## Get VibeDeck

Pick where it should live (for example your Desktop), then in PowerShell:

```powershell
cd $HOME\Desktop
git clone https://github.com/7LayerLabs/pointer-.git vibedeck
cd vibedeck
npm install
```

`npm install` takes a minute or two. It downloads the terminal engine and the desktop runtime (Electron).

## Open it

Double-click **`VibeDeck.bat`** in the `vibedeck` folder. It installs anything missing the first time, then opens the app.

Want it in the taskbar? Right-click `VibeDeck.bat`, choose **Send to > Desktop (create shortcut)**, then right-click the shortcut and change its icon to `vibedeck.ico` in the same folder.

Other ways to start it:

```powershell
npm run desktop   # the desktop app, same as VibeDeck.bat
npm start         # browser mode: prints a private link, open that exact link
```

## First run

1. **Pick a project folder.** The agents only work inside a real project folder, never your whole user folder.
2. Each pane opens Claude, Codex or Grok in that folder. If a CLI asks "Do you trust this folder?", answer it in the pane. VibeDeck never answers those for you.
3. Type a prompt at the bottom and press Enter to send it to every pane with Broadcast on.
4. Open **Review** in the top bar to see what the agents changed, and Keep or Undo each change. VibeDeck saves a checkpoint before every prompt, so nothing is lost.

## Update to the newest version

In the `vibedeck` folder:

```powershell
git pull
npm install
```

Then close and reopen VibeDeck.

## See the redesign mockups

Open `mockups/index.html` in your browser. Option D is the combined direction (Studio layout, preview panel, theme Settings). No install is needed for the mockups.

## Moving your history from another PC (optional)

Code comes from GitHub, but your personal VibeDeck data stays on each PC: prompt history, saved rounds, pipelines, notes and Review checkpoints. To bring them over, copy this folder from the old PC to the same place on the new one while VibeDeck is closed on both:

```
%APPDATA%\vibedeck
```

## If something goes wrong

| Problem | Fix |
| --- | --- |
| VibeDeck.bat opens and closes right away | Run `npm install` in the folder and read the error. Usually Node.js is missing or older than 22. |
| "electron.exe not found" or the window never appears | Run `node node_modules/electron/install.js` in the folder, then try again. |
| A pane says the CLI is not installed | Install that CLI (step 3 above), then restart VibeDeck. Or switch the pane to another CLI from its menu. |
| A pane sits on a sign-in or trust screen | Click into the pane and answer it there. |
| Review shows nothing | Review needs Git installed (`git --version`). It starts tracking from when VibeDeck opens the folder. |
| Port 18801 is already in use | Another VibeDeck is running. Close it, or start with a different port: `$env:VIBEDECK_PORT=18802; npm run desktop` |
| Windows SmartScreen warns about the app | The builds are unsigned. Click "More info", then "Run anyway". |
