const stage = document.querySelector('#stage');
const tabsEl = document.querySelector('#tabs');
const address = document.querySelector('#address');
const statusEl = document.querySelector('#status');
const modeLabel = document.querySelector('#mode-label');
const privacyPill = document.querySelector('#privacy');
const privacyLabel = document.querySelector('#privacy-label');
const welcome = document.querySelector('#welcome');
const tabs = [];
let activeId = null;
let nextId = 1;
let searchEngine = localStorage.getItem('still-search-engine') === 'google' ? 'google' : 'duckduckgo';
let theme = localStorage.getItem('still-theme') === 'dark' ? 'dark' : 'light';
const bookmarks = new Set(JSON.parse(localStorage.getItem('still-bookmarks') || '[]'));
let blockedDomains = new Set();
window.still.getBlockedDomains().then((domains) => { blockedDomains = new Set(domains); }).catch(() => {});

function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const button = document.querySelector('#theme-toggle');
  button.textContent = theme === 'dark' ? '☼' : '◐';
  const target = theme === 'dark' ? 'light' : 'dark';
  button.title = `Switch to ${target} layout`;
  button.setAttribute('aria-label', `Switch to ${target} layout`);
}
applyTheme();

function blockedDomainFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [...blockedDomains].find((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch { return null; }
}

function setSearchEngine(engine) {
  searchEngine = engine === 'google' ? 'google' : 'duckduckgo';
  localStorage.setItem('still-search-engine', searchEngine);
  document.querySelector('#engine-select').value = searchEngine;
  document.querySelector('#home-engine-select').value = searchEngine;
  const label = searchEngine === 'google' ? 'Google' : 'DuckDuckGo';
  document.querySelector('#address').placeholder = `Search with ${label} or enter an address`;
  document.querySelector('#welcome-address').placeholder = `Search with ${label} or enter an address`;
}
setSearchEngine(searchEngine);

function activeTab() { return tabs.find((tab) => tab.id === activeId); }
function sizeActiveView() {
  const tab = activeTab();
  if (!tab?.hasPage) return;
  const rect = stage.getBoundingClientRect();
  window.still.setPageBounds(tab.id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
}
new ResizeObserver(sizeActiveView).observe(stage);
function searchUrl(value) {
  const raw = value.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/i.test(raw) || /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(raw)) return `https://${raw}`;
  const query = encodeURIComponent(raw);
  return searchEngine === 'google'
    ? `https://www.google.com/search?q=${query}`
    : `https://duckduckgo.com/?q=${query}`;
}
function renderTabs() {
  tabsEl.replaceChildren();
  for (const tab of tabs) {
    const button = document.createElement('button');
    button.className = `tab${tab.id === activeId ? ' active' : ''}${tab.isPrivate ? ' private' : ''}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(tab.id === activeId));
    const dot = document.createElement('span'); dot.className = 'tab-dot';
    const title = document.createElement('span'); title.className = 'tab-title'; title.textContent = tab.title || (tab.isPrivate ? 'Private tab' : 'New tab');
    const close = document.createElement('span'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('role', 'button'); close.setAttribute('aria-label', `Close ${title.textContent}`);
    close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(tab.id); });
    button.append(dot, title, close); button.addEventListener('click', () => activateTab(tab.id)); tabsEl.append(button);
  }
}
function activateTab(id) {
  activeId = id;
  const tab = activeTab();
  window.still.activatePage(tab?.hasPage ? tab.id : null);
  welcome.classList.toggle('hidden', !!tab?.hasPage);
  address.value = tab?.url || '';
  modeLabel.textContent = tab?.isPrivate ? 'Private tab' : 'Regular tab';
  privacyLabel.textContent = tab?.isPrivate ? 'Private' : 'Shields on';
  privacyPill.classList.toggle('private', !!tab?.isPrivate);
  updateBookmark();
  statusEl.textContent = tab?.loading ? 'Loading…' : 'Ready when you are';
  renderTabs();
  sizeActiveView();
  if (tab?.hasPage) window.still.pageCommand(tab.id, 'focus');
}
async function createTab({ isPrivate = false, url = '' } = {}) {
  const id = nextId++;
  const partition = isPrivate ? window.still.newPrivatePartition() : 'persist:still-regular';
  const tab = { id, partition, isPrivate, url: '', title: '', hasPage: false, loading: false };
  tabs.push(tab); activeId = id; renderTabs(); activateTab(id);
  if (url) await navigate(url);
}
async function navigate(input) {
  const tab = activeTab(); const target = searchUrl(input);
  if (!tab || !target) return;
  let parsed; try { parsed = new URL(target); } catch { return; }
  if (!['http:', 'https:'].includes(parsed.protocol)) { statusEl.textContent = 'Only web addresses are supported'; return; }
  const blockedDomain = blockedDomainFor(target);
  if (blockedDomain) { statusEl.textContent = `Blocked by Still: ${blockedDomain}`; return; }
  tab.url = target; address.value = target; statusEl.textContent = 'Loading…';
  if (!tab.hasPage) {
    const created = await window.still.createPage(tab.id, tab.partition, tab.isPrivate);
    if (!created) { statusEl.textContent = 'Could not open this tab'; return; }
    tab.hasPage = true;
    welcome.classList.add('hidden');
    window.still.activatePage(tab.id);
    sizeActiveView();
  }
  window.still.navigatePage(tab.id, target);
  renderTabs();
}
async function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id); if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  if (tab.hasPage) await window.still.closePage(tab.id);
  if (!tabs.length) { activeId = null; await createTab(); return; }
  if (activeId === id) activateTab(tabs[Math.min(index, tabs.length - 1)].id); else renderTabs();
}
function updateBookmark() {
  const url = activeTab()?.url; const button = document.querySelector('#bookmark');
  button.classList.toggle('saved', !!url && bookmarks.has(url));
  button.textContent = url && bookmarks.has(url) ? '★' : '☆';
}
function command(command) { const tab = activeTab(); if (tab?.hasPage) window.still.pageCommand(tab.id, command); }
function goFrom(input) { const target = searchUrl(input); if (target) navigate(target); }
async function renderExtensions() {
  const list = document.querySelector('#extension-list');
  const extensions = await window.still.listExtensions();
  list.replaceChildren();
  if (!extensions.length) {
    const empty = document.createElement('p'); empty.className = 'extension-empty'; empty.textContent = 'No extensions added yet.'; list.append(empty);
    return;
  }
  for (const extension of extensions) {
    const row = document.createElement('div'); row.className = 'extension-row';
    const info = document.createElement('div');
    const name = document.createElement('b'); name.textContent = extension.name;
    const version = document.createElement('small'); version.textContent = `Version ${extension.version}`;
    info.append(name, version);
    const remove = document.createElement('button'); remove.className = 'extension-remove'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const result = await window.still.removeExtension(extension.id);
      document.querySelector('#extension-status').textContent = result.ok ? 'Extension removed.' : result.error;
      await renderExtensions();
    });
    row.append(info, remove); list.append(row);
  }
}

window.still.onPageState(({ id, type, value }) => {
  const tab = tabs.find((candidate) => candidate.id === id); if (!tab) return;
  if (type === 'new-tab') { createTab({ isPrivate: tab.isPrivate, url: value }); return; }
  if (type === 'loading') { tab.loading = value; if (id === activeId) statusEl.textContent = value ? 'Loading…' : 'Ready'; }
  if (type === 'title') tab.title = value;
  if (type === 'url') { tab.url = value; if (id === activeId) { address.value = value; updateBookmark(); } }
  if (type === 'error' && id === activeId) statusEl.textContent = value;
  renderTabs();
});

window.still.onMenuCommand((name) => {
  if (name === 'new-tab') createTab();
  if (name === 'close-tab') closeTab(activeId);
  if (name === 'focus-address') { address.focus(); address.select(); }
  if (['back', 'forward', 'reload'].includes(name)) command(name);
});

document.querySelector('#address-form').addEventListener('submit', (event) => { event.preventDefault(); goFrom(address.value); });
document.querySelector('#welcome-form').addEventListener('submit', (event) => { event.preventDefault(); goFrom(document.querySelector('#welcome-address').value); });
document.querySelector('#new-tab').addEventListener('click', () => createTab());
document.querySelector('#private-mode').addEventListener('click', () => createTab({ isPrivate: true }));
document.querySelector('#back').addEventListener('click', () => command('back'));
document.querySelector('#forward').addEventListener('click', () => command('forward'));
document.querySelector('#reload').addEventListener('click', () => command('reload'));
document.querySelector('#engine-select').addEventListener('change', (event) => setSearchEngine(event.target.value));
document.querySelector('#home-engine-select').addEventListener('change', (event) => setSearchEngine(event.target.value));
document.querySelector('#bookmark').addEventListener('click', () => {
  const url = activeTab()?.url; if (!url) return;
  bookmarks.has(url) ? bookmarks.delete(url) : bookmarks.add(url);
  localStorage.setItem('still-bookmarks', JSON.stringify([...bookmarks])); updateBookmark();
});
async function renderBlockedDomains() {
  const list = document.querySelector('#blocked-domain-list');
  blockedDomains = new Set(await window.still.getBlockedDomains());
  list.replaceChildren();
  for (const domain of blockedDomains) {
    const row = document.createElement('li');
    const label = document.createElement('span'); label.textContent = domain;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Unblock';
    remove.addEventListener('click', async () => {
      const result = await window.still.updateBlockedDomains({ remove: domain });
      if (!result.ok) { document.querySelector('#block-domain-status').textContent = result.error; return; }
      blockedDomains = new Set(result.domains);
      await renderBlockedDomains();
    });
    row.append(label, remove); list.append(row);
  }
}
document.querySelector('#privacy').addEventListener('click', async () => {
  document.querySelector('#block-domain-status').textContent = '';
  await renderBlockedDomains();
  document.querySelector('#privacy-dialog').showModal();
});
document.querySelector('#block-domain').addEventListener('click', async () => {
  const input = document.querySelector('#blocked-domain-input');
  const status = document.querySelector('#block-domain-status');
  const result = await window.still.updateBlockedDomains({ add: input.value });
  if (!result.ok) { status.textContent = result.error; return; }
  input.value = ''; status.textContent = 'Site added to the blocklist.';
  blockedDomains = new Set(result.domains);
  await renderBlockedDomains();
});
document.querySelector('#extensions').addEventListener('click', async () => {
  document.querySelector('#extension-status').textContent = '';
  await renderExtensions();
  document.querySelector('#extensions-dialog').showModal();
});
document.querySelector('#theme-toggle').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('still-theme', theme);
  applyTheme();
});
document.querySelector('#add-extension').addEventListener('click', async () => {
  const status = document.querySelector('#extension-status');
  status.textContent = 'Choose an unpacked extension folder…';
  const result = await window.still.addExtension();
  if (result.canceled) { status.textContent = ''; return; }
  if (!result.ok) { status.textContent = result.error; return; }
  status.textContent = `Added ${result.extension.name}. It will load again next time you open Still Browser.`;
  await renderExtensions();
});
document.querySelectorAll('.quick-links .shortcut[data-url]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.url)));
document.querySelector('.add-shortcut').addEventListener('click', () => {
  const value = window.prompt('Enter a website address');
  if (!value?.trim()) return;
  let url;
  try { url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`); }
  catch { statusEl.textContent = 'Enter a valid website address'; return; }
  if (!['http:', 'https:'].includes(url.protocol)) { statusEl.textContent = 'Only web addresses can be added'; return; }
  const shortcuts = JSON.parse(localStorage.getItem('still-shortcuts') || '[]');
  if (shortcuts.some((item) => item.url === url.href)) { statusEl.textContent = 'That shortcut is already here'; return; }
  shortcuts.push({ url: url.href, name: url.hostname.replace(/^www\./, '') });
  localStorage.setItem('still-shortcuts', JSON.stringify(shortcuts));
  const button = document.createElement('button'); button.className = 'shortcut'; button.dataset.url = url.href;
  const icon = document.createElement('span'); icon.className = 'shortcut-icon add-icon'; icon.textContent = shortcuts.at(-1).name.charAt(0).toUpperCase();
  const copy = document.createElement('span'); copy.className = 'shortcut-copy';
  const name = document.createElement('b'); name.textContent = shortcuts.at(-1).name;
  const host = document.createElement('small'); host.textContent = url.hostname;
  copy.append(name, host); button.append(icon, copy);
  button.addEventListener('click', () => navigate(button.dataset.url));
  document.querySelector('.add-shortcut').before(button);
});
for (const item of JSON.parse(localStorage.getItem('still-shortcuts') || '[]')) {
  if (!item || typeof item.url !== 'string' || typeof item.name !== 'string') continue;
  const button = document.createElement('button'); button.className = 'shortcut'; button.dataset.url = item.url;
  const icon = document.createElement('span'); icon.className = 'shortcut-icon add-icon'; icon.textContent = item.name.charAt(0).toUpperCase();
  const copy = document.createElement('span'); copy.className = 'shortcut-copy';
  const name = document.createElement('b'); name.textContent = item.name;
  const host = document.createElement('small');
  try { host.textContent = new URL(item.url).hostname; } catch { continue; }
  copy.append(name, host); button.append(icon, copy);
  button.addEventListener('click', () => navigate(button.dataset.url));
  document.querySelector('.add-shortcut').before(button);
}
window.addEventListener('keydown', (event) => {
  const primary = window.still.platform === 'darwin' ? event.metaKey : event.ctrlKey;
  if (primary && event.key.toLowerCase() === 'l') { event.preventDefault(); address.focus(); address.select(); }
  if (primary && event.key.toLowerCase() === 't') { event.preventDefault(); createTab(); }
  if (primary && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(activeId); }
  if (primary && event.key.toLowerCase() === 'r') { event.preventDefault(); command('reload'); }
  if ((event.altKey && event.key === 'ArrowLeft') || (window.still.platform === 'darwin' && event.metaKey && event.key === 'ArrowLeft')) command('back');
  if ((event.altKey && event.key === 'ArrowRight') || (window.still.platform === 'darwin' && event.metaKey && event.key === 'ArrowRight')) command('forward');
  if (event.key === 'Escape' && document.activeElement === address) address.blur();
});
createTab();
