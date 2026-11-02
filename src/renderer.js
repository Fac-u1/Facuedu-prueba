const $ = (id) => document.getElementById(id);

const welcomeOverlay = $('welcome-overlay');
const welcomeStep = $('welcome-step');
const videoStep = $('video-step');
const themeStep = $('theme-step');
const welcomeVideo = $('welcome-video');
const loginOverlay = $('login-overlay');

const tabsEl = $('tabs');
const addressBar = $('address-bar');
const pinnedList = $('pinned-list');
const tabMenu = $('tab-menu');
const menuDropdown = $('menu-dropdown');

const historyPanel = $('history-panel');
const historyList = $('history-list');
const downloadsPanel = $('downloads-panel');
const downloadsList = $('downloads-list');
const downloadsToast = $('downloads-toast');
const extPanel = $('extensions-panel');
const extList = $('ext-list');
const extStatus = $('ext-status');
const settingsPanel = $('settings-panel');
const engineSelect = $('engine-select');
const PANELS = [historyPanel, downloadsPanel, extPanel, settingsPanel];

const confirmModal = $('confirm-modal');
let pendingConfirm = null;

let tabs = {};
let activeTabId = null;
let pins = [];
let engines = [];
let currentSettings = {};
let phoneTimer = null;

// ---------- Utilidades ----------
function applyTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-light', 'theme-auto');
  document.body.classList.add('theme-' + theme);
}

function showToast(text) {
  const t = $('app-toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function askConfirm({ title, text, okText = 'Aceptar' }, onOk) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okText;
  pendingConfirm = onOk;
  confirmModal.classList.remove('hidden');
}
$('confirm-ok').addEventListener('click', () => {
  confirmModal.classList.add('hidden');
  const f = pendingConfirm;
  pendingConfirm = null;
  if (f) f();
});
$('confirm-cancel').addEventListener('click', () => {
  confirmModal.classList.add('hidden');
  pendingConfirm = null;
});

// Mientras hay un panel, menú, modal o pantalla de inicio abierta, la página de la pestaña se oculta.
let lastOverlay = null;
function refreshOverlay() {
  const open = !!document.querySelector(
    '#welcome-overlay:not(.hidden), #login-overlay:not(.hidden), .panel:not(.hidden), .modal:not(.hidden), #menu-dropdown:not(.hidden), #tab-menu:not(.hidden)'
  );
  if (open !== lastOverlay) {
    lastOverlay = open;
    window.facuedu.setOverlay(open);
  }
}
new MutationObserver(refreshOverlay).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

function showPanel(panel) {
  PANELS.forEach((p) => { if (p !== panel) p.classList.add('hidden'); });
  panel.classList.toggle('hidden');
  return !panel.classList.contains('hidden');
}

function sameSite(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

// ---------- Arranque ----------
async function init() {
  currentSettings = await window.facuedu.getSettings();
  engines = await window.facuedu.getSearchEngines();
  engines.forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    engineSelect.appendChild(opt);
  });
  applyTheme(currentSettings.theme || 'light');
  updateSearchPlaceholder();

  if (!currentSettings.firstRunDone) {
    welcomeOverlay.classList.remove('hidden');
  } else {
    startBrowser();
  }
}
init();

function currentEngineName() {
  const e = engines.find((x) => x.id === currentSettings.searchEngine);
  return e ? e.name : 'Google';
}
function updateSearchPlaceholder() {
  addressBar.placeholder = `Buscar en ${currentEngineName()} o escribir una URL`;
}

// El navegador abre directo. La cuenta es opcional.
function startBrowser() {
  window.facuedu.appReady();
  loadPins();
  refreshAccount();
}

function enterBrowser() {
  loginOverlay.classList.add('hidden');
  stopPhoneUI();
  startBrowser();
}

let loggedInAs = null;
async function refreshAccount() {
  const st = await window.facuedu.authState();
  loggedInAs = st.loggedIn ? st.user : null;
  $('logout-btn').textContent = loggedInAs ? 'Cerrar sesión' : 'Iniciar sesión';
}

function showLogin() {
  loginOverlay.classList.remove('hidden');
  setLoginMessage('');
  showLoginTab('email');
}

$('login-close-btn').addEventListener('click', () => {
  stopPhoneUI();
  window.facuedu.cancelPhoneLogin();
  loginOverlay.classList.add('hidden');
});

// ---------- Bienvenida ----------
$('welcome-continue-btn').addEventListener('click', () => {
  welcomeStep.classList.add('hidden');
  videoStep.classList.remove('hidden');
});
welcomeVideo.addEventListener('error', () => $('video-error').classList.remove('hidden'));
$('video-continue-btn').addEventListener('click', () => {
  welcomeVideo.pause();
  videoStep.classList.add('hidden');
  themeStep.classList.remove('hidden');
});
document.querySelectorAll('.theme-option').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const theme = btn.dataset.theme;
    applyTheme(theme);
    currentSettings = await window.facuedu.saveSettings({ theme, firstRunDone: true });
    welcomeOverlay.classList.add('hidden');
    startBrowser();
  });
});

// ---------- Inicio de sesión ----------
function setLoginMessage(text, kind = '') {
  const el = $('login-message');
  el.textContent = text;
  el.className = 'login-message ' + kind;
}

function showLoginTab(name) {
  document.querySelectorAll('.login-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('email-form').classList.toggle('hidden', name !== 'email');
  $('phone-section').classList.toggle('hidden', name !== 'phone');
  if (name === 'phone') startPhone();
  else stopPhoneUI();
}

document.querySelectorAll('.login-tab').forEach((b) => {
  b.addEventListener('click', () => showLoginTab(b.dataset.tab));
});

function credentials() {
  return { email: $('login-email').value.trim(), password: $('login-password').value };
}

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoginMessage('Entrando...');
  const r = await window.facuedu.signIn(credentials());
  if (!r.ok) return setLoginMessage(r.error, 'error');
  $('login-password').value = '';
  enterBrowser();
});

$('signup-btn').addEventListener('click', async () => {
  setLoginMessage('Creando la cuenta...');
  const r = await window.facuedu.signUp(credentials());
  if (!r.ok) return setLoginMessage(r.error, 'error');
  if (r.pending) return setLoginMessage(r.message, 'ok');
  $('login-password').value = '';
  enterBrowser();
});

document.querySelectorAll('.oauth-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const name = btn.dataset.provider === 'google' ? 'Google' : 'GitHub';
    const r = await window.facuedu.signInOAuth(btn.dataset.provider);
    if (!r.ok) return setLoginMessage(r.error, 'error');
    setLoginMessage(`Se abrió una ventana para iniciar sesión con ${name}.`, 'ok');
  });
});

// Inicio desde el teléfono
async function startPhone() {
  stopPhoneUI();
  setLoginMessage('');
  $('phone-qr').removeAttribute('src');
  $('phone-code').textContent = 'Generando código...';
  const r = await window.facuedu.startPhoneLogin();
  if (!r.ok) {
    $('phone-code').textContent = '';
    return setLoginMessage(r.error, 'error');
  }
  $('phone-qr').src = r.qr;
  $('phone-code').textContent = r.code;
  currentPhoneCode = r.code;
  let left = r.seconds;
  $('phone-timer').textContent = `El código vence en ${left} segundos.`;
  phoneTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      $('phone-timer').textContent = 'El código venció. Generá otro.';
      clearInterval(phoneTimer);
      return;
    }
    $('phone-timer').textContent = `El código vence en ${left} segundos.`;
  }, 1000);
}

function stopPhoneUI() {
  clearInterval(phoneTimer);
  phoneTimer = null;
}

$('phone-refresh-btn').addEventListener('click', startPhone);

let currentPhoneCode = '';
$('copy-code-btn').addEventListener('click', async () => {
  if (!currentPhoneCode) return;
  try {
    await navigator.clipboard.writeText(currentPhoneCode);
    showToast('Código copiado.');
  } catch {
    showToast('No se pudo copiar. Seleccionalo y copialo a mano.');
  }
});

window.facuedu.onPhoneStatus(({ status, error }) => {
  if (status === 'approved') setLoginMessage('¡Listo! Sesión iniciada desde el teléfono.', 'ok');
  else if (status === 'expired') {
    stopPhoneUI();
    $('phone-timer').textContent = 'El código venció. Generá otro.';
    setLoginMessage('El código venció antes de usarse.', 'error');
  } else if (status === 'error') setLoginMessage(error, 'error');
});

window.facuedu.onAuthError(({ error }) => setLoginMessage(error, 'error'));

window.facuedu.onAuthChanged(({ loggedIn }) => {
  // Mientras se muestra la bienvenida, no se entra todavía.
  if (!welcomeOverlay.classList.contains('hidden')) return;
  if (loggedIn) enterBrowser();
  else {
    // Cerró sesión: el navegador sigue abierto en modo invitado.
    closeMenus();
    startBrowser();
  }
});

// Cerrar sesión
// Botón del menú: inicia o cierra sesión según el estado.
$('logout-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  if (!loggedInAs) return showLogin();
  askConfirm({
    title: 'Cerrar sesión',
    text: 'Se cerrarán las pestañas abiertas. El navegador sigue disponible sin cuenta.',
    okText: 'Cerrar sesión',
  }, () => window.facuedu.signOut());
});

// ---------- Pestañas ----------
function renderTabs() {
  tabsEl.innerHTML = '';
  Object.entries(tabs).forEach(([id, tab]) => {
    const el = document.createElement('div');
    el.className = 'tab' + (id === activeTabId ? ' active' : '');
    if (tab.favicon) {
      const img = document.createElement('img');
      img.className = 'tab-icon';
      img.src = tab.favicon;
      img.alt = '';
      el.appendChild(img);
    }
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = tab.title || 'Nueva pestaña';
    const close = document.createElement('span');
    close.className = 'close-x';
    close.textContent = '✕';
    el.append(title, close);

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-x')) window.facuedu.closeTab(id);
      else window.facuedu.switchTab(id);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openTabMenu(id, e.clientX, e.clientY);
    });
    tabsEl.appendChild(el);
  });
}

document.getElementById('new-tab-btn').addEventListener('click', () => window.facuedu.newTab());
document.getElementById('back-btn').addEventListener('click', () => activeTabId && window.facuedu.back(activeTabId));
document.getElementById('forward-btn').addEventListener('click', () => activeTabId && window.facuedu.forward(activeTabId));
document.getElementById('reload-btn').addEventListener('click', () => activeTabId && window.facuedu.reload(activeTabId));
document.getElementById('home-btn').addEventListener('click', () => activeTabId && window.facuedu.home(activeTabId));
document.getElementById('translate-btn').addEventListener('click', () => activeTabId && window.facuedu.translate(activeTabId));

addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && activeTabId) window.facuedu.go(activeTabId, addressBar.value);
});

window.facuedu.onTabCreated(({ id, url }) => {
  tabs[id] = { title: 'Nueva pestaña', url };
  activeTabId = id;
  addressBar.value = url.startsWith('file://') ? '' : url;
  renderTabs();
});
window.facuedu.onTabUpdated(({ id, title, url }) => {
  if (!tabs[id]) tabs[id] = {};
  tabs[id].title = title;
  tabs[id].url = url;
  renderTabs();
});
window.facuedu.onTabNavigated(({ id, url }) => {
  if (!tabs[id]) tabs[id] = {};
  tabs[id].url = url;
  activeTabId = id;
  addressBar.value = url.startsWith('file://') ? '' : url;
  renderTabs();
});
window.facuedu.onTabFavicon(({ id, favicon }) => {
  if (!tabs[id]) tabs[id] = {};
  tabs[id].favicon = favicon;
  renderTabs();
});
window.facuedu.onTabClosed(({ id }) => {
  delete tabs[id];
  renderTabs();
});
window.facuedu.onTabsCleared(() => {
  tabs = {};
  activeTabId = null;
  renderTabs();
});

// ---------- Menú de pestaña (clic derecho) ----------
function openTabMenu(id, x, y) {
  tabMenu.dataset.tab = id;
  const pinned = isPinned(tabs[id] && tabs[id].url);
  $('tab-pin-btn').textContent = pinned ? 'Desanclar' : 'Anclar';
  tabMenu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  tabMenu.style.top = Math.min(y, window.innerHeight - 60) + 'px';
  tabMenu.classList.remove('hidden');
}
$('tab-pin-btn').addEventListener('click', () => {
  const id = tabMenu.dataset.tab;
  tabMenu.classList.add('hidden');
  if (id) togglePin(tabs[id]);
});

function closeMenus() {
  menuDropdown.classList.add('hidden');
  tabMenu.classList.add('hidden');
}

// ---------- Menú de tres puntos ----------
$('menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  tabMenu.classList.add('hidden');
  menuDropdown.classList.toggle('hidden');
  $('pin-page-btn').textContent = isPinned(tabs[activeTabId] && tabs[activeTabId].url)
    ? 'Desanclar esta página' : 'Anclar esta página';
});
document.addEventListener('click', (e) => {
  if (!$('menu-wrap').contains(e.target)) menuDropdown.classList.add('hidden');
  if (!tabMenu.contains(e.target)) tabMenu.classList.add('hidden');
});

$('pin-page-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  togglePin(tabs[activeTabId]);
});
$('dev-tools-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  window.facuedu.devtools();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'F12') {
    e.preventDefault();
    window.facuedu.devtools();
  }
});
$('help-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  window.facuedu.help();
});
$('ext-menu-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  openExtensions();
});
$('settings-btn').addEventListener('click', () => {
  menuDropdown.classList.add('hidden');
  engineSelect.value = currentSettings.searchEngine || 'google';
  showPanel(settingsPanel);
});
engineSelect.addEventListener('change', async () => {
  currentSettings = await window.facuedu.saveSettings({ searchEngine: engineSelect.value });
  updateSearchPlaceholder();
  showToast(`Buscador cambiado a ${currentEngineName()}. Las pestañas nuevas lo usarán.`);
});

$('clear-history-btn').addEventListener('click', async () => {
  const history = await window.facuedu.clearHistory();
  renderHistory(history);
  menuDropdown.classList.add('hidden');
});

// ---------- Anclados ----------
function isPinned(pageUrl) {
  return !!pageUrl && pins.some((p) => p.url === pageUrl);
}

async function loadPins() {
  pins = await window.facuedu.getPins();
  renderPins();
}

function renderPins() {
  pinnedList.innerHTML = '';
  if (!pins.length) {
    const hint = document.createElement('span');
    hint.className = 'pin-empty';
    hint.textContent = 'Clic derecho en una pestaña → Anclar, para dejar tus sitios favoritos aquí.';
    pinnedList.appendChild(hint);
    return;
  }
  pins.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'pin';
    chip.title = p.url;
    if (p.favicon) {
      const img = document.createElement('img');
      img.src = p.favicon;
      img.alt = '';
      chip.appendChild(img);
    } else {
      const dot = document.createElement('span');
      dot.className = 'pin-dot';
      chip.appendChild(dot);
    }
    const name = document.createElement('span');
    name.className = 'pin-name';
    name.textContent = p.title;
    const x = document.createElement('button');
    x.className = 'pin-x';
    x.title = 'Desanclar';
    x.textContent = '✕';
    chip.append(name, x);

    chip.addEventListener('click', () => openPin(p.url));
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = await window.facuedu.removePin(p.url);
      pins = r.pins;
      renderPins();
    });
    pinnedList.appendChild(chip);
  });
}

// Un clic en un anclado cambia a la pestaña de ese sitio, o la abre si no existe.
function openPin(pageUrl) {
  const match = Object.entries(tabs).find(([, t]) => t.url && sameSite(t.url, pageUrl));
  if (match) window.facuedu.switchTab(match[0]);
  else window.facuedu.newTab(pageUrl);
}

async function togglePin(tab) {
  if (!tab || !tab.url || tab.url.startsWith('file://')) {
    return showToast('Abrí un sitio web para poder anclarlo.');
  }
  if (isPinned(tab.url)) {
    const r = await window.facuedu.removePin(tab.url);
    pins = r.pins;
    showToast('Sitio desanclado.');
  } else {
    const r = await window.facuedu.addPin({ url: tab.url, title: tab.title, favicon: tab.favicon });
    if (!r.ok) return showToast(r.error);
    pins = r.pins;
    showToast('Sitio anclado.');
  }
  renderPins();
}

// ---------- Historial ----------
document.getElementById('history-btn').addEventListener('click', async () => {
  if (showPanel(historyPanel)) renderHistory(await window.facuedu.getHistory());
});
function renderHistory(history) {
  historyList.innerHTML = '';
  if (!history.length) {
    historyList.innerHTML = '<li class="empty">Sin historial todavía</li>';
    return;
  }
  history.slice(0, 200).forEach((h) => {
    const li = document.createElement('li');
    li.className = 'clickable';
    li.textContent = h.title || h.url;
    li.addEventListener('click', () => activeTabId && window.facuedu.go(activeTabId, h.url));
    historyList.appendChild(li);
  });
}

// ---------- Descargas ----------
document.getElementById('downloads-btn').addEventListener('click', async () => {
  if (showPanel(downloadsPanel)) renderDownloads(await window.facuedu.getDownloads());
});
function renderDownloads(downloads) {
  downloadsList.innerHTML = '';
  if (!downloads.length) {
    downloadsList.innerHTML = '<li class="empty">Sin descargas todavía</li>';
    return;
  }
  downloads.slice(0, 200).forEach((d) => {
    const li = document.createElement('li');
    const estado = d.state === 'completed' ? 'Completa' : 'Cancelada';
    li.textContent = `${d.filename} — ${estado}`;
    downloadsList.appendChild(li);
  });
}

const activeToasts = {};
window.facuedu.onDownloadStarted(({ filename }) => {
  const el = document.createElement('div');
  el.className = 'download-item';
  el.innerHTML = `<div></div><div class="bar"><div class="bar-fill"></div></div><div class="eta">Calculando tiempo...</div>`;
  el.firstChild.textContent = filename;
  downloadsToast.appendChild(el);
  activeToasts[filename] = el;
});
window.facuedu.onDownloadProgress(({ filename, receivedBytes, totalBytes, etaSeconds }) => {
  const el = activeToasts[filename];
  if (!el) return;
  const pct = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
  el.querySelector('.bar-fill').style.width = pct + '%';
  const eta = etaSeconds != null ? formatEta(etaSeconds) : 'calculando...';
  el.querySelector('.eta').textContent = `${pct}% · Tiempo restante: ${eta}`;
});
window.facuedu.onDownloadDone(({ filename, state }) => {
  const el = activeToasts[filename];
  if (el) {
    el.querySelector('.eta').textContent = state === 'completed' ? 'Descarga completa' : `Descarga ${state}`;
    setTimeout(() => el.remove(), 5000);
  }
  if (!downloadsPanel.classList.contains('hidden')) {
    window.facuedu.getDownloads().then(renderDownloads);
  }
});
function formatEta(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec}s`;
}

// ---------- Extensiones ----------
document.getElementById('extensions-btn').addEventListener('click', openExtensions);

async function openExtensions() {
  if (showPanel(extPanel)) {
    extStatus.textContent = '';
    renderExtensions(await window.facuedu.getExtensions());
  }
}

function renderExtensions(list) {
  extList.innerHTML = '';
  if (!list.length) {
    extList.innerHTML = '<li class="empty">No tenés extensiones instaladas todavía.</li>';
    return;
  }
  list.forEach((x) => {
    const li = document.createElement('li');
    li.className = 'ext-item';
    const name = document.createElement('div');
    name.className = 'ext-name';
    name.textContent = x.name;
    const state = document.createElement('div');
    state.className = 'ext-state';
    state.textContent = x.error ? 'No funciona: ' + x.error : (x.enabled ? 'Activada' : 'Desactivada');
    if (x.error) state.classList.add('error');

    const actions = document.createElement('div');
    actions.className = 'ext-actions';
    const toggle = document.createElement('button');
    toggle.textContent = x.enabled ? 'Desactivar' : 'Activar';
    toggle.addEventListener('click', async () => {
      const r = await window.facuedu.toggleExtension(x.id);
      renderExtensions(r.extensions);
      if (r.error) extStatus.textContent = r.error;
    });
    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.textContent = 'Quitar';
    remove.addEventListener('click', async () => {
      const r = await window.facuedu.removeExtension(x.id);
      renderExtensions(r.extensions);
    });
    actions.append(toggle, remove);
    li.append(name, state, actions);
    extList.appendChild(li);
  });
}

$('ext-install-btn').addEventListener('click', () => {
  askConfirm({
    title: 'Antes de instalar',
    text: 'Instalá solo extensiones de personas de confianza y con ayuda de un adulto.',
    okText: 'Entiendo, elegir carpeta',
  }, async () => {
    const r = await window.facuedu.installExtension();
    renderExtensions(r.extensions || []);
    if (r.ok) extStatus.textContent = 'Extensión instalada.';
    else if (!r.canceled) extStatus.textContent = r.error;
  });
});

$('ext-guide-btn').addEventListener('click', () => {
  window.facuedu.extensionsGuide();
});

document.querySelectorAll('.store-link').forEach((btn) => {
  btn.addEventListener('click', () => window.facuedu.newTab(btn.dataset.url));
});
