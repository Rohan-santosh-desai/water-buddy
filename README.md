# Water Buddy

Global desktop water reminder. Cartoon buddy + flying plane banner over **any app/screen** (not VS Code specific).
Lives in the system tray, click-through, never steals focus.

## Run
    npm install
    npm start              # first run opens Settings
    npm start -- --now     # fire a reminder immediately (testing)

## Settings (tray icon -> Settings...)
Interval (presets or custom 1-480 min), snooze, auto-hide, active hours, daily goal, name, plane/sound toggles, launch at login.
Config file: Settings -> tray "Edit settings file" (hot-reloads).

## Installer (optional)
    npm run dist           # builds into ./dist

Keep this folder anywhere outside your projects, e.g. ~/tools/water-buddy.

## Your own character (Memoji style)
Settings -> "Character image" -> Choose... (transparent PNG works best), or drop `assets/buddy.png`.
Memoji: iPhone/Mac Messages -> Memoji sticker -> save/share as image -> pick it here. Default is a built-in cartoon.
