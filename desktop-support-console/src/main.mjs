import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let windowRef = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'RankedDarts Support Console',
    backgroundColor: '#07100f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  windowRef.loadFile(path.join(__dirname, 'index.html'));
  windowRef.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    windowRef.hide();
  });
}

function createTray() {
  // A tiny transparent placeholder keeps the app usable until branded assets are added.
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('RankedDarts Support Console');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Support Console öffnen', click: () => { windowRef.show(); windowRef.focus(); } },
    { type: 'separator' },
    { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { windowRef.show(); windowRef.focus(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else windowRef.show(); });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

ipcMain.handle('support-console:notify', (_event, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
});

ipcMain.handle('support-console:hide', () => windowRef?.hide());
ipcMain.handle('support-console:quit', () => { isQuitting = true; app.quit(); });
