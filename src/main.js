// Water Buddy - main process.
// Tray app. An overlay window is created only when a reminder fires, then destroyed,
// so idle cost is just the tray + one timer.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, dialog, globalShortcut } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const DEFAULTS = {
  userName: 'Rohan',
  intervalMinutes: 45,
  snoozeMinutes: 10,
  autoDismissSeconds: 60,
  activeHours: { start: 9, end: 20 }, // 24h clock; no reminders outside this window
  dailyGoal: 8,
  plane: true,
  sound: true,
};

let cfg = { ...DEFAULTS };
let state = { date: '', count: 0 };
let tray = null;
let overlay = null;
let timer = null;
let autoTimer = null;
let nextAt = 0;
let pausedUntil = 0;
let responded = false;

const cfgPath = () => path.join(app.getPath('userData'), 'config.json');
const statePath = () => path.join(app.getPath('userData'), 'state.json');
// Custom character: userData/buddy.(png|webp|gif) wins over assets/buddy.png; else built-in SVG.
function buddyImgUrl() {
  const cands = ['png', 'webp', 'gif', 'jpg'].map((e) => path.join(app.getPath('userData'), `buddy.${e}`))
    .concat(path.join(__dirname, '..', 'assets', 'buddy.png'));
  const hit = cands.find((p) => fs.existsSync(p));
  return hit ? pathToFileURL(hit).href + `?v=${fs.statSync(hit).mtimeMs}` : null;
}
const today = () => new Date().toLocaleDateString('en-CA');

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    cfg = { ...DEFAULTS, ...raw, activeHours: { ...DEFAULTS.activeHours, ...(raw.activeHours || {}) } };
  } catch (e) {
    cfg = { ...DEFAULTS };
    if (e.code === 'ENOENT') saveConfig();
  }
  cfg.intervalMinutes = Math.max(1, Number(cfg.intervalMinutes) || DEFAULTS.intervalMinutes);
  cfg.snoozeMinutes = Math.max(1, Number(cfg.snoozeMinutes) || DEFAULTS.snoozeMinutes);
}
function saveConfig() {
  try { fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch {}
}
function loadState() {
  try { state = JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { state = { date: '', count: 0 }; }
  rollDay();
}
function rollDay() {
  if (state.date !== today()) { state = { date: today(), count: 0 }; saveState(); }
}
function saveState() {
  try { fs.writeFileSync(statePath(), JSON.stringify(state)); } catch {}
}

// ---------- scheduling ----------
function schedule(ms) {
  clearTimeout(timer);
  nextAt = Date.now() + ms;
  timer = setTimeout(fire, ms);
  refreshTray();
}

function fire() {
  if (overlay) return;
  const now = Date.now();
  if (pausedUntil > now) return schedule(pausedUntil - now + 1000);
  const h = new Date().getHours();
  const { start, end } = cfg.activeHours;
  if (h < start || h >= end) return schedule(10 * 60 * 1000); // re-check in 10 min
  showOverlay();
}

// ---------- overlay ----------
function showOverlay() {
  rollDay();
  responded = false;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;

  overlay = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // never steal focus from the editor
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true }); // click-through by default
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.once('ready-to-show', () => overlay && overlay.showInactive());
  overlay.webContents.once('did-finish-load', () => {
    overlay?.webContents.send('show', {
      userName: cfg.userName,
      count: state.count,
      goal: cfg.dailyGoal,
      plane: cfg.plane,
      sound: cfg.sound,
      snoozeMinutes: cfg.snoozeMinutes,
      buddyImg: buddyImgUrl(),
    });
  });
  overlay.on('closed', () => { overlay = null; clearTimeout(autoTimer); });

  autoTimer = setTimeout(() => respond('snooze', true), cfg.autoDismissSeconds * 1000);
}

function respond(action, auto = false) {
  if (responded) return;
  responded = true;
  clearTimeout(autoTimer);
  if (action === 'yes') {
    rollDay();
    state.count += 1;
    saveState();
    schedule(cfg.intervalMinutes * 60 * 1000);
  } else {
    schedule(cfg.snoozeMinutes * 60 * 1000);
  }
  if (auto) {
    overlay?.webContents.send('leave');
    setTimeout(closeOverlay, 1500);
  } else {
    setTimeout(closeOverlay, 8000); // safety net; renderer normally calls 'done' sooner
  }
  return state.count;
}

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
}

// ---------- settings window ----------
let settingsWin = null;
function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  const wa = screen.getPrimaryDisplay().workAreaSize;       // fit small / scaled laptop screens
  settingsWin = new BrowserWindow({
    width: Math.min(500, wa.width - 40), height: Math.min(820, wa.height - 40),
    resizable: true, minimizable: true, maximizable: true,
    title: 'Water Buddy', autoHideMenuBar: true, backgroundColor: '#f6f8fb', center: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };

ipcMain.handle('cfg:get', () => ({
  ...cfg, count: state.count,
  openAtLogin: app.getLoginItemSettings().openAtLogin,
  nextAt, paused: pausedUntil > Date.now(),
}));
ipcMain.handle('cfg:set', (_e, n) => {
  cfg = {
    ...cfg,
    userName: String(n.userName ?? cfg.userName).slice(0, 30) || DEFAULTS.userName,
    intervalMinutes: clamp(n.intervalMinutes, 1, 480, cfg.intervalMinutes),
    snoozeMinutes: clamp(n.snoozeMinutes, 1, 120, cfg.snoozeMinutes),
    autoDismissSeconds: clamp(n.autoDismissSeconds, 10, 600, cfg.autoDismissSeconds),
    dailyGoal: clamp(n.dailyGoal, 1, 30, cfg.dailyGoal),
    activeHours: {
      start: clamp(n.activeHours?.start, 0, 23, cfg.activeHours.start),
      end: clamp(n.activeHours?.end, 1, 24, cfg.activeHours.end),
    },
    plane: !!n.plane,
    sound: !!n.sound,
  };
  saveConfig();
  app.setLoginItemSettings({
    openAtLogin: !!n.openAtLogin,
    ...(app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }),
  });
  pausedUntil = 0;
  schedule(cfg.intervalMinutes * 60 * 1000);
  return true;
});
ipcMain.handle('cfg:pickImage', async () => {
  const r = await dialog.showOpenDialog(settingsWin, {
    title: 'Choose your character (transparent PNG works best)',
    properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'webp', 'gif', 'jpg'] }],
  });
  if (r.canceled || !r.filePaths[0]) return false;
  for (const e of ['png', 'webp', 'gif', 'jpg']) { try { fs.unlinkSync(path.join(app.getPath('userData'), `buddy.${e}`)); } catch {} }
  const ext = path.extname(r.filePaths[0]).slice(1).toLowerCase().replace('jpeg', 'jpg');
  fs.copyFileSync(r.filePaths[0], path.join(app.getPath('userData'), `buddy.${ext}`));
  return true;
});
ipcMain.handle('cfg:resetImage', () => {
  for (const e of ['png', 'webp', 'gif', 'jpg']) { try { fs.unlinkSync(path.join(app.getPath('userData'), `buddy.${e}`)); } catch {} }
  return true;
});
ipcMain.on('cfg:test', () => !overlay && showOverlay());

ipcMain.handle('respond', (_e, action) => respond(action === 'yes' ? 'yes' : 'snooze'));
ipcMain.on('interactive', (_e, on) => overlay?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on('done', closeOverlay);

// ---------- tray ----------
const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function refreshTray() {
  if (!tray) return;
  const paused = pausedUntil > Date.now();
  const status = paused ? `Paused until ${fmt(pausedUntil)}` : `Next reminder: ${fmt(nextAt)}`;
  tray.setToolTip(`Water Buddy - ${status}`);
  const menu = Menu.buildFromTemplate([
    { label: status, enabled: false },
    { label: `Today: ${state.count} / ${cfg.dailyGoal} glasses`, enabled: false },
    { type: 'separator' },
    { label: 'Settings...', click: openSettings },
    { label: 'Remind me now', click: () => !overlay && showOverlay() },
    paused
      ? { label: 'Resume', click: () => { pausedUntil = 0; schedule(cfg.intervalMinutes * 60 * 1000); } }
      : { label: 'Pause for 1 hour', click: () => { pausedUntil = Date.now() + 3600e3; schedule(3600e3 + 1000); } },
    {
      label: 'Interval',
      submenu: [20, 30, 45, 60, 90].map((m) => ({
        label: `Every ${m} min`, type: 'radio', checked: cfg.intervalMinutes === m,
        click: () => { cfg.intervalMinutes = m; saveConfig(); schedule(m * 60 * 1000); },
      })),
    },
    {
      label: 'Launch at login', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({
        openAtLogin: item.checked,
        ...(app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] }),
      }),
    },
    { label: 'Edit settings file', click: () => shell.openPath(cfgPath()) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  app.setAppUserModelId('dev.rohan.waterbuddy');
  if (process.platform === 'darwin') app.dock?.hide();
  const firstRun = !fs.existsSync(cfgPath());
  loadConfig();
  loadState();

  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')));
  tray.on('click', () => tray.popUpContextMenu());

  schedule(cfg.intervalMinutes * 60 * 1000);
  setInterval(refreshTray, 60 * 1000);

  // hot-reload config.json edits
  fs.watchFile(cfgPath(), { interval: 2000 }, () => {
    loadConfig();
    schedule(cfg.intervalMinutes * 60 * 1000);
  });

  if (process.argv.includes('--now')) showOverlay(); // handy for testing: npm start -- --now
  globalShortcut.register('CommandOrControl+Alt+W', openSettings); // hotkey: Ctrl+Alt+W
  if (firstRun || process.argv.includes('--settings')) openSettings();
});

app.on('second-instance', openSettings); // launching the app again opens Settings
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault()); // keep running in tray
