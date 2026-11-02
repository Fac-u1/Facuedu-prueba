const path = require('path');
const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, MenuItem, dialog, safeStorage, shell } = require('electron');

const PROTOCOL = 'facuedu';
// Solo una instancia: si Google vuelve mientras la app está abierta, llega a esta misma instancia.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let pendingAuthUrl = null;
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}
const fs = require('fs');
const url = require('url');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// ---------- Configuración ----------
const DEFAULT_SETTINGS = { firstRunDone: false, theme: 'light', searchEngine: 'google' };
let currentSettings = { ...DEFAULT_SETTINGS };
let settingsFile, sessionFile, extensionsFile;

// Motores de búsqueda disponibles (la barra de direcciones y la página de inicio usan el elegido).
const SEARCH_ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  amazon: { name: 'Amazon', url: 'https://www.amazon.com/s?k=' },
  ebay: { name: 'eBay', url: 'https://www.ebay.com/sch/i.html?_nkw=' },
  wikipedia: { name: 'Wikipedia', url: 'https://es.wikipedia.org/w/index.php?search=' },
  perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
};
function currentEngine() {
  return SEARCH_ENGINES[currentSettings.searchEngine] || SEARCH_ENGINES.google;
}

// Usamos un user-agent de Chrome de escritorio normal en vez del de Electron
// por defecto: sitios como Google pueden marcar el navegador como "tráfico
// inusual" o bot si detectan la palabra "Electron" en el user-agent.
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MAX_PINS = 12;
const TOOLBAR_HEIGHT = 128; // pestañas (40) + barra de direcciones (~49) + anclados (~36)

function loadJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

// ---------- Estado de ventanas ----------
let mainWindow = null;
const views = {};
let activeTabId = null;
let tabCounter = 0;
let viewHidden = false; // se oculta la página mientras hay un panel o menú abierto encima
let currentUser = null; // { id, email } cuando hay sesión iniciada

function newTabUrl() {
  return url.format({
    pathname: path.join(__dirname, 'src', 'newtab.html'),
    protocol: 'file:',
    slashes: true,
    query: { theme: currentSettings.theme, engine: currentEngine().name, search: currentEngine().url },
  });
}
function extensionsGuideUrl() {
  return url.format({
    pathname: path.join(__dirname, 'src', 'extensiones.html'),
    protocol: 'file:',
    slashes: true,
  });
}
function helpUrl() {
  return url.format({
    pathname: path.join(__dirname, 'src', 'ayuda.html'),
    protocol: 'file:',
    slashes: true,
    query: { theme: currentSettings.theme },
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 760,
    minHeight: 480,
    title: 'Facuedu.uy AYUDA Navegadore',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.on('resize', resizeActiveView);
  mainWindow.on('closed', () => { mainWindow = null; });
  attachSpellcheckMenu(mainWindow.webContents);
}

function resizeActiveView() {
  if (!mainWindow || !activeTabId) return;
  const view = views[activeTabId];
  if (!view) return;
  if (viewHidden) {
    view.setAutoResize({ width: false, height: false });
    view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const [width, height] = mainWindow.getContentSize();
  view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
  view.setAutoResize({ width: true, height: true });
}

function sendToChrome(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Corrector ortográfico: menú de clic derecho con sugerencias, en cualquier
// campo de texto (barra de direcciones, buscadores, formularios de páginas).
function attachSpellcheckMenu(webContents) {
  webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    let hasItems = false;

    if (params.misspelledWord) {
      hasItems = true;
      if (params.dictionarySuggestions.length === 0) {
        menu.append(new MenuItem({ label: 'Sin sugerencias', enabled: false }));
      }
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => webContents.replaceMisspelling(suggestion),
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: `Agregar "${params.misspelledWord}" al diccionario`,
        click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    if (params.isEditable) {
      hasItems = true;
      menu.append(new MenuItem({ label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ label: 'Pegar', role: 'paste', enabled: params.editFlags.canPaste }));
      menu.append(new MenuItem({ label: 'Seleccionar todo', role: 'selectAll' }));
    } else if (params.selectionText) {
      hasItems = true;
      menu.append(new MenuItem({ label: 'Copiar', role: 'copy' }));
    }

    if (hasItems) menu.popup();
  });
}

function createTab(targetUrl) {
  if (!mainWindow) return null;
  tabCounter += 1;
  const id = `tab-${tabCounter}`;
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-page.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  views[id] = view;
  mainWindow.addBrowserView(view);
  activeTabId = id;
  resizeActiveView();
  attachSpellcheckMenu(view.webContents);
  view.webContents.setUserAgent(DESKTOP_CHROME_UA);

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const isDevtools = key === 'f12' || (key === 'i' && ((input.control && input.shift) || (input.meta && input.alt)));
    if (isDevtools) {
      event.preventDefault();
      view.webContents.toggleDevTools();
    }
  });

  const finalUrl = normalizeUrl(targetUrl);
  view.webContents.loadURL(finalUrl);

  view.webContents.on('page-title-updated', (_e, title) => {
    sendToChrome('tab-updated', { id, title, url: view.webContents.getURL() });
  });
  view.webContents.on('page-favicon-updated', (_e, favicons) => {
    if (favicons && favicons[0]) sendToChrome('tab-favicon', { id, favicon: favicons[0] });
  });
  view.webContents.on('did-navigate', (_e, navUrl) => {
    sendToChrome('tab-navigated', { id, url: navUrl });
    addHistory(navUrl, view.webContents.getTitle());
  });
  view.webContents.on('did-navigate-in-page', (_e, navUrl) => {
    sendToChrome('tab-navigated', { id, url: navUrl });
  });

  sendToChrome('tab-created', { id, url: finalUrl });
  return id;
}

function switchTab(id) {
  if (!views[id] || !mainWindow) return;
  activeTabId = id;
  mainWindow.setTopBrowserView(views[id]);
  resizeActiveView();
  sendToChrome('tab-navigated', { id, url: views[id].webContents.getURL() });
}

function closeTab(id) {
  const view = views[id];
  if (!view || !mainWindow) return;
  mainWindow.removeBrowserView(view);
  view.webContents.destroy();
  delete views[id];

  const remaining = Object.keys(views);
  if (activeTabId === id) {
    if (remaining.length > 0) {
      switchTab(remaining[remaining.length - 1]);
    } else {
      activeTabId = null;
      createTab(newTabUrl());
    }
  }
  sendToChrome('tab-closed', { id });
}

function closeAllTabs() {
  if (!mainWindow) return;
  for (const id of Object.keys(views)) {
    try {
      mainWindow.removeBrowserView(views[id]);
      views[id].webContents.destroy();
    } catch {
      // la pestaña ya no existe
    }
    delete views[id];
  }
  activeTabId = null;
  sendToChrome('tabs-cleared', {});
}

function normalizeUrl(input) {
  let target = (input || '').trim();
  if (!target) return newTabUrl();
  if (target === 'facuedu://newtab') return newTabUrl();
  const looksLikeFile = /^file:\/\//i.test(target);
  const looksLikeUrl = /^[a-z]+:\/\//i.test(target);
  const looksLikeDomain = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(target) && !target.includes(' ');
  if (looksLikeFile || looksLikeUrl) return target;
  if (looksLikeDomain) return 'https://' + target;
  return currentEngine().url + encodeURIComponent(target);
}

// ---------- Datos por usuario (historial, descargas, anclados) ----------
// Sin cuenta se usa la carpeta "invitado". Con cuenta, cada usuario tiene la suya.
function userDir() {
  const name = currentUser ? currentUser.id.replace(/[^a-zA-Z0-9-]/g, '') : 'invitado';
  const dir = path.join(app.getPath('userData'), 'usuarios', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function readUserJSON(name, fallback) {
  const dir = userDir();
  return dir ? loadJSON(path.join(dir, name), fallback) : fallback;
}
function writeUserJSON(name, data) {
  const dir = userDir();
  if (dir) saveJSON(path.join(dir, name), data);
}

function addHistory(navUrl, title) {
  if (!navUrl || navUrl.startsWith('file://') || navUrl.startsWith('devtools://')) return;
  const history = readUserJSON('history.json', []);
  history.unshift({ url: navUrl, title: title || navUrl, date: new Date().toISOString() });
  writeUserJSON('history.json', history.slice(0, 2000));
}

function addDownloadRecord(record) {
  const downloads = readUserJSON('downloads.json', []);
  downloads.unshift(record);
  writeUserJSON('downloads.json', downloads.slice(0, 500));
}

// ---------- Sesión: guardada cifrada con safeStorage ----------
function saveSessionFile(session) {
  if (!safeStorage.isEncryptionAvailable()) return;
  const data = JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token });
  fs.writeFileSync(sessionFile, safeStorage.encryptString(data));
}
function readSessionFile() {
  try {
    if (!fs.existsSync(sessionFile) || !safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionFile)));
  } catch {
    return null;
  }
}
function deleteSessionFile() {
  try { fs.rmSync(sessionFile, { force: true }); } catch { /* nada que borrar */ }
}

// ---------- Supabase (solo en el proceso principal) ----------
// Guardamos el código PKCE en memoria: la app no usa localStorage.
const memoryStorage = new Map();
const memStore = {
  getItem: (k) => (memoryStorage.has(k) ? memoryStorage.get(k) : null),
  setItem: (k, v) => memoryStorage.set(k, v),
  removeItem: (k) => memoryStorage.delete(k),
};

let supabase = null;
function sb() {
  if (!supabase) {
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage: memStore,
      },
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) {
        const changed = !currentUser || currentUser.id !== session.user.id;
        currentUser = { id: session.user.id, email: session.user.email || '' };
        saveSessionFile(session);
        if (changed) sendToChrome('auth-changed', { loggedIn: true, user: currentUser });
      }
    });
  }
  return supabase;
}

function traducirErrorAuth(err) {
  const m = (err && err.message) || '';
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/already (been )?registered|already exists/i.test(m)) return 'Ya existe una cuenta con ese correo. Probá iniciar sesión.';
  if (/least \d+ characters|password.*short|weak password/i.test(m)) return 'La contraseña es muy corta. Usá al menos 8 caracteres.';
  if (/not confirmed/i.test(m)) return 'Tenés que confirmar tu correo antes de entrar. Revisá tu bandeja de entrada.';
  if (/rate limit|too many/i.test(m)) return 'Hiciste muchos intentos. Esperá un rato y probá de nuevo.';
  return 'No se pudo completar la acción. Revisá tu conexión a internet e intentá de nuevo.';
}

const publicUser = () => (currentUser ? { id: currentUser.id, email: currentUser.email } : null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function restoreSession() {
  const saved = readSessionFile();
  if (!saved || !saved.refresh_token) return;
  try {
    const { data, error } = await sb().auth.setSession({
      access_token: saved.access_token,
      refresh_token: saved.refresh_token,
    });
    if (error || !data.session) {
      deleteSessionFile();
      currentUser = null;
    }
  } catch {
    deleteSessionFile();
    currentUser = null;
  }
}

async function signOut() {
  cancelPhoneLogin();
  try { await sb().auth.signOut({ scope: 'local' }); } catch { /* seguimos igual */ }
  deleteSessionFile();
  currentUser = null;
  closeAllTabs();
  // Borramos cookies y datos web para que la siguiente cuenta no vea nada de la anterior.
  try {
    await session.defaultSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers'],
    });
  } catch { /* si falla, al menos se cerró la sesión */ }
  sendToChrome('auth-changed', { loggedIn: false });
}

// Inicio con correo y contraseña
ipcMain.handle('auth:sign-in', async (_e, { email, password } = {}) => {
  const e = String(email || '').trim();
  const p = String(password || '');
  if (!e || !p) return fail('Escribí tu correo y tu contraseña.');
  if (!EMAIL_RE.test(e)) return fail('Ese correo no parece válido.');
  const { data, error } = await sb().auth.signInWithPassword({ email: e, password: p });
  if (error) return fail(traducirErrorAuth(error));
  currentUser = { id: data.user.id, email: data.user.email || e };
  saveSessionFile(data.session);
  return { ok: true, user: publicUser() };
});

// Crear cuenta con correo y contraseña
ipcMain.handle('auth:sign-up', async (_e, { email, password } = {}) => {
  const e = String(email || '').trim();
  const p = String(password || '');
  if (!e || !p) return fail('Escribí un correo y una contraseña para crear la cuenta.');
  if (!EMAIL_RE.test(e)) return fail('Ese correo no parece válido.');
  if (p.length < 8) return fail('La contraseña es muy corta. Usá al menos 8 caracteres.');
  const { data, error } = await sb().auth.signUp({ email: e, password: p });
  if (error) return fail(traducirErrorAuth(error));
  if (data.session) {
    currentUser = { id: data.user.id, email: data.user.email || e };
    saveSessionFile(data.session);
    return { ok: true, user: publicUser() };
  }
  return { ok: true, pending: true, message: 'Creamos tu cuenta. Revisá tu correo para confirmarla y después iniciá sesión.' };
});

// Inicio con Google o GitHub: se abre en el navegador del sistema (Google bloquea ventanas embebidas).
// Al terminar, el navegador vuelve a la app con facuedu://auth?code=...
ipcMain.handle('auth:oauth', async (_e, provider) => {
  if (!['google', 'github'].includes(provider)) return fail('Ese inicio de sesión no está disponible.');
  const { data, error } = await sb().auth.signInWithOAuth({
    provider,
    options: { redirectTo: config.AUTH_CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error || !data || !data.url) return fail('No pudimos abrir el inicio de sesión. Revisá tu conexión.');
  await shell.openExternal(data.url);
  return { ok: true, pending: true };
});

function handleAuthCallback(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith(config.AUTH_CALLBACK_URL)) return;
  const params = new URL(rawUrl).searchParams;
  const code = params.get('code');
  if (!code) {
    const reason = params.get('error_description') || params.get('error');
    sendToChrome('auth-error', { error: reason ? 'No se pudo iniciar sesión. Probá de nuevo.' : 'No se pudo completar el inicio de sesión. Probá de nuevo.' });
    return;
  }
  sb().auth.exchangeCodeForSession(code).then(({ error: exErr }) => {
    if (exErr) sendToChrome('auth-error', { error: traducirErrorAuth(exErr) });
  });
}

app.on('second-instance', (_e, argv) => {
  const link = argv.find((a) => a.startsWith(PROTOCOL + '://'));
  if (link) handleAuthCallback(link);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('open-url', (event, link) => {
  event.preventDefault();
  if (mainWindow) handleAuthCallback(link);
  else pendingAuthUrl = link;
});

// Inicio desde el teléfono con código QR
let phoneLogin = null; // { code, timer, expire }
let polling = false;

function randomChars(n) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = require('crypto').randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function cancelPhoneLogin() {
  if (!phoneLogin) return;
  clearInterval(phoneLogin.timer);
  clearTimeout(phoneLogin.expire);
  phoneLogin = null;
}

async function startPhoneLogin() {
  cancelPhoneLogin();
  const code = 'SDFANL-' + randomChars(6);
  const { error } = await sb().rpc('create_login_request', { p_code: code });
  if (error) return fail('No pudimos crear el código. Revisá tu conexión e intentá de nuevo.');
  const qr = await QRCode.toDataURL(config.PHONE_LOGIN_URL + '?login=' + encodeURIComponent(code), { width: 220, margin: 1 });
  phoneLogin = {
    code,
    timer: setInterval(pollPhoneLogin, 2500),
    expire: setTimeout(() => {
      cancelPhoneLogin();
      sendToChrome('auth-phone-status', { status: 'expired' });
    }, 180000),
  };
  return { ok: true, code, qr, seconds: 180 };
}

async function pollPhoneLogin() {
  if (!phoneLogin || polling) return;
  polling = true;
  const code = phoneLogin.code;
  try {
    const { data, error } = await sb().rpc('get_login_status', { p_code: code });
    if (error || !phoneLogin || phoneLogin.code !== code) return;
    if (data === 'approved') {
      const { data: tokenHash, error: cErr } = await sb().rpc('consume_login', { p_code: code });
      cancelPhoneLogin();
      if (cErr || !tokenHash) {
        sendToChrome('auth-phone-status', { status: 'error', error: 'No se pudo completar. Generá otro código.' });
        return;
      }
      const { data: vData, error: vErr } = await sb().auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
      if (vErr || !vData.session) {
        sendToChrome('auth-phone-status', { status: 'error', error: traducirErrorAuth(vErr) });
        return;
      }
      currentUser = { id: vData.user.id, email: vData.user.email || '' };
      saveSessionFile(vData.session);
      sendToChrome('auth-phone-status', { status: 'approved' });
    } else if (data === 'expired') {
      cancelPhoneLogin();
      sendToChrome('auth-phone-status', { status: 'expired' });
    }
  } finally {
    polling = false;
  }
}

ipcMain.handle('auth:phone-start', () => startPhoneLogin());
ipcMain.handle('auth:phone-cancel', () => { cancelPhoneLogin(); return { ok: true }; });
ipcMain.handle('auth:get-state', () => ({ loggedIn: !!currentUser, user: publicUser() }));
ipcMain.handle('auth:sign-out', async () => { await signOut(); return { ok: true }; });

// ---------- IPC: primer inicio, tema y motor de búsqueda ----------
ipcMain.handle('app:get-settings', () => currentSettings);
ipcMain.handle('app:save-settings', (_e, partial = {}) => {
  const clean = { ...partial };
  if (clean.searchEngine && !SEARCH_ENGINES[clean.searchEngine]) delete clean.searchEngine;
  currentSettings = { ...currentSettings, ...clean };
  saveJSON(settingsFile, currentSettings);
  return currentSettings;
});
ipcMain.handle('search:engines', () =>
  Object.entries(SEARCH_ENGINES).map(([id, e]) => ({ id, name: e.name })));
ipcMain.handle('app:ready', () => {
  if (Object.keys(views).length === 0) return createTab(newTabUrl());
  return null;
});

// ---------- IPC: navegación y pestañas ----------
ipcMain.handle('nav:new-tab', (_e, target) => createTab(target || newTabUrl()));
ipcMain.handle('nav:switch-tab', (_e, id) => switchTab(id));
ipcMain.handle('nav:close-tab', (_e, id) => closeTab(id));
ipcMain.handle('nav:go', (_e, { id, url: target }) => {
  const view = views[id];
  if (!view) return;
  view.webContents.loadURL(normalizeUrl(target));
});
ipcMain.handle('nav:back', (_e, id) => views[id]?.webContents.canGoBack() && views[id].webContents.goBack());
ipcMain.handle('nav:forward', (_e, id) => views[id]?.webContents.canGoForward() && views[id].webContents.goForward());
ipcMain.handle('nav:reload', (_e, id) => views[id]?.webContents.reload());
ipcMain.handle('nav:home', (_e, id) => views[id]?.webContents.loadURL(newTabUrl()));
ipcMain.handle('nav:help', () => createTab(config.HELP_URL));
ipcMain.handle('nav:devtools', () => {
  if (activeTabId && views[activeTabId]) views[activeTabId].webContents.toggleDevTools();
  return { ok: true };
});
ipcMain.handle('nav:extensions-guide', () => createTab(extensionsGuideUrl()));
ipcMain.handle('nav:translate', (_e, id) => {
  const view = views[id];
  if (!view) return;
  const current = view.webContents.getURL();
  if (!current || current.startsWith('file://')) return;

  // Si ya está traducida, volvemos a la página original
  if (current.startsWith('https://translate.google.com/translate?')) {
    try {
      const parsed = new URL(current);
      const original = parsed.searchParams.get('u');
      if (original) {
        view.webContents.loadURL(original);
        return;
      }
    } catch {
      // si algo falla, seguimos abajo y probamos traducir igual
    }
  }

  const translateUrl = 'https://translate.google.com/translate?sl=auto&tl=es&u=' + encodeURIComponent(current);
  view.webContents.loadURL(translateUrl);
});
// La página se oculta mientras hay un panel o menú abierto, para que no quede tapada.
ipcMain.handle('ui:overlay', (_e, hidden) => {
  viewHidden = !!hidden;
  resizeActiveView();
});

// ---------- IPC: historial ----------
ipcMain.handle('history:get', () => readUserJSON('history.json', []));
ipcMain.handle('history:clear', () => {
  writeUserJSON('history.json', []);
  return [];
});

// ---------- IPC: descargas ----------
ipcMain.handle('downloads:get', () => readUserJSON('downloads.json', []));

// ---------- IPC: anclados (por usuario) ----------
ipcMain.handle('pins:get', () => readUserJSON('pinned.json', []));
ipcMain.handle('pins:add', (_e, pin = {}) => {
  if (!/^https?:\/\//i.test(String(pin.url || ''))) return fail('Solo se pueden anclar sitios web (http o https).');
  const list = readUserJSON('pinned.json', []);
  if (list.some((p) => p.url === pin.url)) return { ok: true, pins: list };
  if (list.length >= MAX_PINS) return fail(`Ya tenés ${MAX_PINS} anclados. Quitá alguno para agregar otro.`, { pins: list });
  list.push({
    url: String(pin.url),
    title: String(pin.title || pin.url).slice(0, 60),
    favicon: /^https?:\/\//i.test(String(pin.favicon || '')) ? String(pin.favicon) : '',
  });
  writeUserJSON('pinned.json', list);
  return { ok: true, pins: list };
});
ipcMain.handle('pins:remove', (_e, pinUrl) => {
  const list = readUserJSON('pinned.json', []).filter((p) => p.url !== pinUrl);
  writeUserJSON('pinned.json', list);
  return { ok: true, pins: list };
});

// ---------- Extensiones (guardadas en el equipo) ----------
function readExtRecords() { return loadJSON(extensionsFile, []); }
function writeExtRecords(list) { saveJSON(extensionsFile, list); }
const publicExt = (r) => ({ id: r.id, name: r.name, path: r.path, enabled: !!r.enabled, error: r.error || '' });

async function loadExtRecord(rec) {
  if (!fs.existsSync(path.join(rec.path, 'manifest.json'))) {
    rec.error = 'No se encuentra la carpeta de la extensión. ¿Se movió o se borró?';
    return false;
  }
  try {
    const ext = await session.defaultSession.loadExtension(rec.path, { allowFileAccess: true });
    rec.id = ext.id;
    rec.name = ext.name || rec.name;
    rec.error = '';
    return true;
  } catch {
    rec.error = 'Electron no pudo cargar esta extensión. Puede usar funciones que Electron no soporta.';
    return false;
  }
}

async function loadEnabledExtensions() {
  const list = readExtRecords();
  for (const rec of list) {
    if (rec.enabled) await loadExtRecord(rec);
  }
  writeExtRecords(list);
}

ipcMain.handle('ext:list', () => readExtRecords().map(publicExt));
ipcMain.handle('ext:install', async () => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegí la carpeta de la extensión',
    properties: ['openDirectory'],
  });
  const list = readExtRecords();
  if (picked.canceled || !picked.filePaths[0]) {
    return { ok: false, canceled: true, extensions: list.map(publicExt) };
  }
  const folder = picked.filePaths[0];
  if (list.some((r) => r.path === folder)) {
    return fail('Esa extensión ya está instalada.', { extensions: list.map(publicExt) });
  }
  if (!fs.existsSync(path.join(folder, 'manifest.json'))) {
    return fail('Esa carpeta no tiene manifest.json. Elegí la carpeta que contiene ese archivo.', { extensions: list.map(publicExt) });
  }
  const rec = { path: folder, id: '', name: path.basename(folder), enabled: true, error: '' };
  const ok = await loadExtRecord(rec);
  if (!ok) return fail(rec.error, { extensions: list.map(publicExt) });
  list.push(rec);
  writeExtRecords(list);
  return { ok: true, extensions: list.map(publicExt) };
});
ipcMain.handle('ext:toggle', async (_e, id) => {
  const list = readExtRecords();
  const rec = list.find((r) => r.id === id);
  if (!rec) return fail('No encontramos esa extensión.', { extensions: list.map(publicExt) });
  if (rec.enabled) {
    try { session.defaultSession.removeExtension(rec.id); } catch { /* ya no estaba cargada */ }
    rec.enabled = false;
  } else {
    rec.enabled = true;
    const ok = await loadExtRecord(rec);
    if (!ok) rec.enabled = false;
  }
  writeExtRecords(list);
  return { ok: rec.enabled || !rec.error, error: rec.error, extensions: list.map(publicExt) };
});
ipcMain.handle('ext:remove', (_e, id) => {
  let list = readExtRecords();
  const rec = list.find((r) => r.id === id);
  if (rec && rec.enabled) {
    try { session.defaultSession.removeExtension(rec.id); } catch { /* nada que quitar */ }
  }
  list = list.filter((r) => r.id !== id);
  writeExtRecords(list);
  return { ok: true, extensions: list.map(publicExt) }; // la carpeta no se borra del equipo
});

// ---------- Arranque ----------
app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  settingsFile = path.join(userDataPath, 'settings.json');
  sessionFile = path.join(userDataPath, 'session.bin');
  extensionsFile = path.join(userDataPath, 'extensions.json');
  currentSettings = { ...DEFAULT_SETTINGS, ...loadJSON(settingsFile, {}) };

  // Corrector ortográfico en español y en inglés
  try {
    session.defaultSession.setSpellCheckerLanguages(['es-419', 'en-US']);
  } catch {
    // si el sistema no tiene esos diccionarios, seguimos sin frenar la app
  }

  session.defaultSession.on('will-download', (_event, item) => {
    const totalBytes = item.getTotalBytes();
    const startTime = Date.now();
    sendToChrome('download-started', { filename: item.getFilename(), totalBytes });

    item.on('updated', (_e2, state) => {
      if (state === 'progressing') {
        const received = item.getReceivedBytes();
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = elapsedSec > 0 ? received / elapsedSec : 0;
        const etaSeconds = totalBytes > 0 && speed > 0 ? (totalBytes - received) / speed : null;
        sendToChrome('download-progress', {
          filename: item.getFilename(),
          receivedBytes: received,
          totalBytes,
          etaSeconds,
        });
      }
    });
    item.once('done', (_e2, state) => {
      sendToChrome('download-done', { filename: item.getFilename(), state });
      addDownloadRecord({
        filename: item.getFilename(),
        state,
        date: new Date().toISOString(),
        totalBytes,
      });
    });
  });

  await restoreSession();
  await loadEnabledExtensions();
  createWindow();
  if (pendingAuthUrl) {
    const link = pendingAuthUrl;
    pendingAuthUrl = null;
    mainWindow.webContents.once('did-finish-load', () => handleAuthCallback(link));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
