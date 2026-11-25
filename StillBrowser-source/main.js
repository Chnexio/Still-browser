const { app, BrowserWindow, WebContentsView, Menu, session, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const TRACKERS = [
  /(^|\.)doubleclick\.net$/i, /(^|\.)googlesyndication\.com$/i,
  /(^|\.)google-analytics\.com$/i, /(^|\.)googletagmanager\.com$/i,
  /(^|\.)connect\.facebook\.net$/i, /(^|\.)graph\.facebook\.com$/i,
  /(^|\.)ads-twitter\.com$/i, /(^|\.)analytics\.twitter\.com$/i,
  /(^|\.)hotjar\.com$/i, /(^|\.)clarity\.ms$/i,
  /(^|\.)segment\.io$/i, /(^|\.)amplitude\.com$/i,
  /(^|\.)mixpanel\.com$/i, /(^|\.)adservice\.google\./i,
  /(^|\.)adnxs\.com$/i, /(^|\.)scorecardresearch\.com$/i,
  /(^|\.)quantserve\.com$/i, /(^|\.)taboola\.com$/i,
  /(^|\.)outbrain\.com$/i, /(^|\.)criteo\.com$/i,
  /(^|\.)pubmatic\.com$/i, /(^|\.)branch\.io$/i,
  /(^|\.)appsflyer\.com$/i,
];
const sessions = new Map();
const pages = new Map();
const extensionRecords = new Map();
const blockedDomains = new Set();
let regularSession;

function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim().toLowerCase();
  if (!input || input.includes('*') || input.includes('@')) return null;
  try {
    if (!input.includes('://') && /[/?#]/.test(input)) return null;
    const parsed = new URL(input.includes('://') ? input : `https://${input}`);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    const host = parsed.hostname.replace(/\.$/, '');
    if (!host || !host.includes('.') || host.length > 253) return null;
    return host;
  } catch { return null; }
}

function matchesBlockedDomain(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return [...blockedDomains].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

async function restoreBlockedDomains() {
  const file = path.join(app.getPath('userData'), 'blocked-domains.json');
  try {
    const values = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(values)) for (const value of values) {
      const domain = normalizeDomain(value);
      if (domain) blockedDomains.add(domain);
    }
  } catch { /* First run or an unavailable saved list. */ }
}

async function saveBlockedDomains() {
  const file = path.join(app.getPath('userData'), 'blocked-domains.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify([...blockedDomains].sort(), null, 2));
}

function extensionList() {
  return [...extensionRecords.values()].map(({ id, name, version }) => ({ id, name, version }));
}

async function saveExtensionPaths() {
  const file = path.join(app.getPath('userData'), 'extensions.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify([...extensionRecords.values()].map(({ path: extensionPath }) => extensionPath), null, 2));
}

async function loadExtensionFolder(folder) {
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
  if (!manifest.name || !manifest.version || !manifest.manifest_version) throw new Error('That folder does not contain a valid browser extension manifest.');
  const loaded = await regularSession.extensions.loadExtension(folder);
  const name = loaded.name || manifest.name;
  extensionRecords.set(loaded.id, { id: loaded.id, name, version: loaded.version || manifest.version, path: folder });
  return extensionRecords.get(loaded.id);
}

async function restoreExtensions() {
  const file = path.join(app.getPath('userData'), 'extensions.json');
  let folders = [];
  try { folders = JSON.parse(await fs.readFile(file, 'utf8')); } catch { return; }
  if (!Array.isArray(folders)) return;
  for (const folder of folders) {
    if (typeof folder !== 'string') continue;
    try { await loadExtensionFolder(folder); } catch (error) { console.warn(`Could not restore extension from ${folder}: ${error.message}`); }
  }
}

function configureSession(partition, isPrivate) {
  if (sessions.has(partition)) return sessions.get(partition);
  const ses = session.fromPartition(partition, { cache: !isPrivate });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    let blocked = false;
    try {
      const hostname = new URL(details.url).hostname;
      blocked = TRACKERS.some((rule) => rule.test(hostname))
        || (details.resourceType === 'mainFrame' && matchesBlockedDomain(hostname));
      if (blocked && details.resourceType === 'mainFrame') {
        const item = [...pages.values()].find((page) => page.view.webContents.id === details.webContentsId);
        if (item) sendPageState(item.win, item.id, 'error', `Blocked by Still: ${hostname}`);
      }
    } catch { /* Leave non-web requests alone. */ }
    callback({ cancel: blocked });
  });
  sessions.set(partition, ses);
  return ses;
}

function sendPageState(win, id, type, value) {
  if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('page-state', { id, type, value });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 760, minHeight: 560,
    backgroundColor: '#101511', title: 'Still Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.loadFile('index.html');
  win.on('closed', () => {
    for (const [id, item] of pages) {
      if (item.win === win) {
        pages.delete(id);
        if (!item.view.webContents.isDestroyed()) item.view.webContents.destroy();
      }
    }
  });
  return win;
}

function installApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const sendCommand = (command) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('menu-command', command);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'Command+T', click: () => sendCommand('new-tab') },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'Command+W', click: () => sendCommand('close-tab') },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [
      { label: 'Focus Address Bar', accelerator: 'Command+L', click: () => sendCommand('focus-address') },
      { label: 'Back', accelerator: 'Command+Left', click: () => sendCommand('back') },
      { label: 'Forward', accelerator: 'Command+Right', click: () => sendCommand('forward') },
      { label: 'Reload', accelerator: 'Command+R', click: () => sendCommand('reload') },
      { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { role: 'windowMenu' },
  ]));
}

function pageFor(event, id) {
  const item = pages.get(id);
  return item && item.win === BrowserWindow.fromWebContents(event.sender) ? item : null;
}

app.whenReady().then(async () => {
  installApplicationMenu();
  await restoreBlockedDomains();
  regularSession = configureSession('persist:still-regular', false);

  ipcMain.handle('create-page', (event, { id, partition, isPrivate }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || typeof id !== 'number' || pages.has(id)) return false;
    const validPartition = isPrivate
      ? typeof partition === 'string' && /^private-[a-z0-9-]+$/i.test(partition)
      : partition === 'persist:still-regular';
    if (!validPartition) return false;
    const ses = configureSession(partition, isPrivate);
    const view = new WebContentsView({
      webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
    });
    view.setVisible(false);
    win.contentView.addChildView(view);
    pages.set(id, { id, win, view, partition, isPrivate });

    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) sendPageState(win, id, 'new-tab', url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (navigationEvent, url) => {
      if (!/^https?:\/\//i.test(url)) navigationEvent.preventDefault();
    });
    wc.on('did-start-loading', () => sendPageState(win, id, 'loading', true));
    wc.on('did-stop-loading', () => {
      sendPageState(win, id, 'loading', false);
      sendPageState(win, id, 'url', wc.getURL());
    });
    wc.on('page-title-updated', (_e, title) => sendPageState(win, id, 'title', title));
    wc.on('did-navigate', (_e, url) => sendPageState(win, id, 'url', url));
    wc.on('did-navigate-in-page', (_e, url) => sendPageState(win, id, 'url', url));
    wc.on('did-fail-load', (_e, errorCode) => {
      if (errorCode === -20) sendPageState(win, id, 'error', 'Blocked by Still’s site list');
      else if (errorCode !== -3) sendPageState(win, id, 'error', 'Could not load this page');
    });
    return true;
  });

  ipcMain.on('page-bounds', (event, { id, bounds }) => {
    const item = pageFor(event, id);
    if (!item || !bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return;
    item.view.setBounds({
      x: Math.max(0, Math.round(bounds.x)), y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)), height: Math.max(0, Math.round(bounds.height)),
    });
  });
  ipcMain.on('activate-page', (event, id) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    for (const item of pages.values()) if (item.win === win) item.view.setVisible(id !== null && item.id === id);
    const item = id === null ? null : pageFor(event, id);
    if (item) { win.contentView.addChildView(item.view); item.view.webContents.focus(); }
  });
  ipcMain.on('navigate-page', (event, { id, url }) => {
    const item = pageFor(event, id);
    if (item && /^https?:\/\//i.test(url)) item.view.webContents.loadURL(url);
  });
  ipcMain.on('page-command', (event, { id, command }) => {
    const item = pageFor(event, id); if (!item) return;
    const wc = item.view.webContents;
    if (command === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (command === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (command === 'reload') wc.reload();
    if (command === 'focus') wc.focus();
  });
  ipcMain.handle('close-page', async (event, id) => {
    const item = pageFor(event, id); if (!item) return false;
    pages.delete(id);
    item.win.contentView.removeChildView(item.view);
    if (!item.view.webContents.isDestroyed()) item.view.webContents.destroy();
    if (item.isPrivate) {
      const ses = session.fromPartition(item.partition);
      await ses.clearStorageData(); await ses.clearCache();
      sessions.delete(item.partition);
    }
    return true;
  });

  ipcMain.handle('list-extensions', () => extensionList());
  ipcMain.handle('add-extension', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Select an unpacked browser extension folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const folder = path.resolve(result.filePaths[0]);
      if ([...extensionRecords.values()].some((item) => item.path === folder)) return { ok: false, error: 'That extension is already added.' };
      const entry = await loadExtensionFolder(folder);
      await saveExtensionPaths();
      return { ok: true, extension: { id: entry.id, name: entry.name, version: entry.version } };
    } catch (error) {
      return { ok: false, error: error.message || 'Electron could not load that extension.' };
    }
  });
  ipcMain.handle('remove-extension', async (_event, id) => {
    const entry = extensionRecords.get(id);
    if (!entry) return { ok: false, error: 'Extension not found.' };
    regularSession.extensions.removeExtension(id);
    extensionRecords.delete(id);
    await saveExtensionPaths();
    return { ok: true };
  });

  ipcMain.handle('blocked-domains:get', () => [...blockedDomains].sort());
  ipcMain.handle('blocked-domains:update', async (event, { add, remove } = {}) => {
    if (!BrowserWindow.fromWebContents(event.sender)) return { ok: false, error: 'Invalid browser window.' };
    if (typeof add === 'string') {
      const domain = normalizeDomain(add);
      if (!domain) return { ok: false, error: 'Enter a valid domain such as example.com.' };
      if (blockedDomains.size >= 100 && !blockedDomains.has(domain)) return { ok: false, error: 'The site blocklist is full (100 domains).' };
      blockedDomains.add(domain);
    }
    if (typeof remove === 'string') blockedDomains.delete(remove);
    try { await saveBlockedDomains(); }
    catch { return { ok: false, error: 'Could not save the site blocklist.' }; }
    return { ok: true, domains: [...blockedDomains].sort() };
  });

  restoreExtensions().catch((error) => console.warn(`Could not restore extensions: ${error.message}`)).finally(() => createWindow());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
