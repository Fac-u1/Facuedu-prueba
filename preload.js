const { contextBridge, ipcRenderer } = require('electron');

// Solo se exponen funciones concretas: la interfaz nunca recibe Node ni ipcRenderer completo.
const invoke = (channel, data) => ipcRenderer.invoke(channel, data);
const listen = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));

contextBridge.exposeInMainWorld('facuedu', {
  // primer inicio / tema / motor de búsqueda
  getSettings: () => invoke('app:get-settings'),
  saveSettings: (partial) => invoke('app:save-settings', partial),
  appReady: () => invoke('app:ready'),
  getSearchEngines: () => invoke('search:engines'),

  // inicio de sesión
  authState: () => invoke('auth:get-state'),
  signIn: (data) => invoke('auth:sign-in', data),
  signUp: (data) => invoke('auth:sign-up', data),
  signInOAuth: (provider) => invoke('auth:oauth', provider),
  startPhoneLogin: () => invoke('auth:phone-start'),
  cancelPhoneLogin: () => invoke('auth:phone-cancel'),
  signOut: () => invoke('auth:sign-out'),

  // pestañas / navegación
  newTab: (url) => invoke('nav:new-tab', url),
  switchTab: (id) => invoke('nav:switch-tab', id),
  closeTab: (id) => invoke('nav:close-tab', id),
  go: (id, url) => invoke('nav:go', { id, url }),
  back: (id) => invoke('nav:back', id),
  forward: (id) => invoke('nav:forward', id),
  reload: (id) => invoke('nav:reload', id),
  home: (id) => invoke('nav:home', id),
  help: () => invoke('nav:help'),
  extensionsGuide: () => invoke('nav:extensions-guide'),
  devtools: () => invoke('nav:devtools'),
  translate: (id) => invoke('nav:translate', id),
  setOverlay: (hidden) => invoke('ui:overlay', hidden),

  // historial
  getHistory: () => invoke('history:get'),
  clearHistory: () => invoke('history:clear'),

  // descargas
  getDownloads: () => invoke('downloads:get'),

  // anclados
  getPins: () => invoke('pins:get'),
  addPin: (pin) => invoke('pins:add', pin),
  removePin: (url) => invoke('pins:remove', url),

  // extensiones
  getExtensions: () => invoke('ext:list'),
  installExtension: () => invoke('ext:install'),
  toggleExtension: (id) => invoke('ext:toggle', id),
  removeExtension: (id) => invoke('ext:remove', id),

  // eventos desde main
  onTabCreated: listen('tab-created'),
  onTabUpdated: listen('tab-updated'),
  onTabNavigated: listen('tab-navigated'),
  onTabClosed: listen('tab-closed'),
  onTabFavicon: listen('tab-favicon'),
  onTabsCleared: listen('tabs-cleared'),
  onDownloadStarted: listen('download-started'),
  onDownloadProgress: listen('download-progress'),
  onDownloadDone: listen('download-done'),
  onAuthChanged: listen('auth-changed'),
  onAuthError: listen('auth-error'),
  onPhoneStatus: listen('auth-phone-status'),
});
