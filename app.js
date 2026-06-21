const STORAGE_KEY = 'couple-catalog-state-v1';
const API_ENDPOINT = '/api/omdb';
const APP_VERSION = '1.0.0';

const LABELS = [
  { value: 'none', label: 'No label' },
  { value: 'me', label: 'My suggestion' },
  { value: 'her', label: 'Her suggestion' },
  { value: 'ours', label: 'Suggested by both' },
];

const CONTEXTS = [
  { value: 'both', label: 'Both' },
  { value: 'together', label: 'Together' },
  { value: 'distance', label: 'Distance' },
];

const STATUSES = [
  { value: 'want', label: 'Want to watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'watched', label: 'Watched' },
  { value: 'paused', label: 'Paused' },
  { value: 'dropped', label: 'Dropped' },
];

const TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
];

const WATCH_FILTERS = [
  { value: 'all', label: 'All items' },
  { value: 'unwatched', label: 'Not watched' },
  { value: 'watched', label: 'Watched' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'priority', label: 'Priority' },
];

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Year' },
  { value: 'rating', label: 'Rating' },
  { value: 'priority', label: 'Priority' },
  { value: 'random', label: 'Random' },
];

const state = {
  version: APP_VERSION,
  items: [],
  history: [],
  settings: {
    theme: 'dark',
    lastViewedItemId: null,
    lastRandomPickId: null,
  },
  ui: {
    search: '',
    type: 'all',
    label: 'all',
    context: 'all',
    status: 'all',
    watch: 'all',
    sort: 'recent',
    chips: new Set(['unwatched']),
  },
  cache: {},
};

const els = {};
let saveTimer = null;
let activeModal = null;

function $(id) { return document.getElementById(id); }

function nowISO() { return new Date().toISOString(); }

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && typeof saved === 'object') {
      state.items = Array.isArray(saved.items) ? saved.items : [];
      state.history = Array.isArray(saved.history) ? saved.history : [];
      state.settings = { ...state.settings, ...(saved.settings || {}) };
      state.cache = saved.cache && typeof saved.cache === 'object' ? saved.cache : {};
    }
  } catch (err) {
    console.warn('Could not load saved state', err);
  }

  normalizeLegacyData();
  applyTheme();
}

function normalizeLegacyData() {
  state.items = state.items.map((item) => ({
    label: 'none',
    context: 'both',
    status: 'want',
    favorite: false,
    priority: false,
    suggestedBy: 'none',
    notes: '',
    reason: '',
    watched: false,
    watchedAt: null,
    lastOpenedAt: null,
    createdAt: item.createdAt || nowISO(),
    updatedAt: item.updatedAt || nowISO(),
    raw: item.raw || {},
    ...item,
  }));

  state.history = state.history.map((entry) => ({
    id: entry.id || uid(),
    createdAt: entry.createdAt || nowISO(),
    ...entry,
  }));
}

function saveState(immediate = false) {
  const persist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: APP_VERSION,
      items: state.items,
      history: state.history,
      settings: state.settings,
      cache: state.cache,
    }));
  };

  if (immediate) {
    persist();
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 120);
}

function init() {
  cacheElements();
  bindGlobals();
  loadState();
  setupSelects();
  setupChips();
  bindEvents();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function cacheElements() {
  [
    'summaryGrid', 'suggestionTitle', 'suggestionText', 'catalogGrid', 'emptyState',
    'catalogHeading', 'catalogMeta', 'historyList', 'themeToggle', 'exportBtn',
    'searchInput', 'addBtn', 'drawBtn', 'compareBtn', 'openLastBtn', 'clearHistoryBtn',
    'resetFiltersBtn', 'typeFilter', 'labelFilter', 'contextFilter', 'statusFilter',
    'watchFilter', 'sortFilter', 'quickChips', 'modalRoot', 'toast'
  ].forEach((id) => { els[id] = $(id); });
}

function bindGlobals() {
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme || 'dark';
  if (els.themeToggle) els.themeToggle.textContent = (state.settings.theme || 'dark') === 'dark' ? '◐' : '◑';
}

function setupSelects() {
  fillSelect(els.typeFilter, TYPES, state.ui.type);
  fillSelect(els.labelFilter, [{ value: 'all', label: 'All labels' }, ...LABELS.filter(x => x.value !== 'none')], state.ui.label);
  fillSelect(els.contextFilter, [{ value: 'all', label: 'All contexts' }, ...CONTEXTS.filter(x => x.value !== 'both')], state.ui.context);
  fillSelect(els.statusFilter, [{ value: 'all', label: 'All statuses' }, ...STATUSES], state.ui.status);
  fillSelect(els.watchFilter, WATCH_FILTERS, state.ui.watch);
  fillSelect(els.sortFilter, SORTS, state.ui.sort);
}

function fillSelect(el, options, selected) {
  if (!el) return;
  el.innerHTML = options.map((opt) => `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`).join('');
  el.value = selected;
}

function setupChips() {
  const chips = [
    { value: 'favorites', label: 'Favorites' },
    { value: 'priority', label: 'Priority' },
    { value: 'watched', label: 'Watched' },
    { value: 'unwatched', label: 'Unwatched' },
  ];
  els.quickChips.innerHTML = chips.map(chip => `
    <button class="chip ${state.ui.chips.has(chip.value) ? 'active' : ''}" data-chip="${chip.value}">${chip.label}</button>
  `).join('');
}

function bindEvents() {
  els.searchInput.addEventListener('input', () => {
    state.ui.search = els.searchInput.value.trim();
    render();
  });

  [els.typeFilter, els.labelFilter, els.contextFilter, els.statusFilter, els.watchFilter, els.sortFilter].forEach((select) => {
    select.addEventListener('change', () => {
      state.ui.type = els.typeFilter.value;
      state.ui.label = els.labelFilter.value;
      state.ui.context = els.contextFilter.value;
      state.ui.status = els.statusFilter.value;
      state.ui.watch = els.watchFilter.value;
      state.ui.sort = els.sortFilter.value;
      render();
    });
  });

  els.quickChips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    const value = btn.dataset.chip;
    if (state.ui.chips.has(value)) state.ui.chips.delete(value);
    else state.ui.chips.add(value);
    setupChips();
    render();
  });

  els.themeToggle.addEventListener('click', toggleTheme);
  els.addBtn.addEventListener('click', () => openAddModal());
  els.drawBtn.addEventListener('click', () => drawRandom());
  els.compareBtn.addEventListener('click', () => openCompareModal());
  els.openLastBtn.addEventListener('click', openLastItem);
  els.clearHistoryBtn.addEventListener('click', clearHistory);
  els.resetFiltersBtn.addEventListener('click', resetFilters);
  els.exportBtn.addEventListener('click', openBackupModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      els.searchInput.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      openAddModal();
    }
  });

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (hash.startsWith('item/')) {
      const id = hash.split('/')[1];
      const item = getItem(id);
      if (item) openDetailModal(item);
    }
  });
}

function toggleTheme() {
  state.settings.theme = (state.settings.theme || 'dark') === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveState();
  render();
}

function resetFilters() {
  state.ui.search = '';
  state.ui.type = 'all';
  state.ui.label = 'all';
  state.ui.context = 'all';
  state.ui.status = 'all';
  state.ui.watch = 'all';
  state.ui.sort = 'recent';
  state.ui.chips = new Set(['unwatched']);
  els.searchInput.value = '';
  setupSelects();
  setupChips();
  render();
}

function clearHistory() {
  state.history = [];
  saveState(true);
  render();
  toast('History cleared');
}

function openLastItem() {
  const lastId = state.settings.lastViewedItemId || state.items[0]?.id;
  const item = getItem(lastId);
  if (item) openDetailModal(item);
  else toast('No item to open yet');
}

function openModal(html) {
  closeModal();
  els.modalRoot.innerHTML = html;
  const backdrop = els.modalRoot.querySelector('.modal-backdrop');
  if (!backdrop) return;
  activeModal = backdrop;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
}

function closeModal() {
  if (els.modalRoot) els.modalRoot.innerHTML = '';
  activeModal = null;
  location.hash = '';
}

function toast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => els.toast.classList.add('hidden'), 1800);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function itemMatchesSearch(item, search) {
  if (!search) return true;
  const hay = [item.title, item.originalTitle, item.year, item.genre, item.synopsis, item.actors, item.director, item.type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(search.toLowerCase());
}

function passesFilters(item) {
  if (state.ui.type !== 'all' && item.type !== state.ui.type) return false;
  if (state.ui.label !== 'all' && item.label !== state.ui.label) return false;
  if (state.ui.context !== 'all' && item.context !== state.ui.context) return false;
  if (state.ui.status !== 'all' && item.status !== state.ui.status) return false;
  if (state.ui.watch === 'watched' && !item.watched && item.status !== 'watched') return false;
  if (state.ui.watch === 'unwatched' && (item.watched || item.status === 'watched')) return false;
  if (state.ui.watch === 'favorites' && !item.favorite) return false;
  if (state.ui.watch === 'priority' && !item.priority) return false;
  if (state.ui.chips.has('favorites') && !item.favorite) return false;
  if (state.ui.chips.has('priority') && !item.priority) return false;
  if (state.ui.chips.has('watched') && !(item.watched || item.status === 'watched')) return false;
  if (state.ui.chips.has('unwatched') && (item.watched || item.status === 'watched')) return false;
  return true;
}

function sortItems(items) {
  const list = [...items];
  switch (state.ui.sort) {
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'year':
      return list.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    case 'rating':
      return list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    case 'priority':
      return list.sort((a, b) => Number(b.priority) - Number(a.priority) || Number(b.favorite) - Number(a.favorite) || Number(b.updatedAt?.localeCompare(a.updatedAt || '')));
    case 'random':
      return list.sort(() => Math.random() - 0.5);
    case 'recent':
    default:
      return list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  }
}

function getVisibleItems() {
  return sortItems(state.items.filter((item) => itemMatchesSearch(item, state.ui.search) && passesFilters(item)));
}

function render() {
  setupChips();
  const visible = getVisibleItems();
  renderSummary(visible);
  renderSuggestion(visible);
  renderCatalog(visible);
  renderHistory();
  renderMeta(visible);
  saveState();
}

function renderSummary(visible) {
  const items = state.items;
  const watched = items.filter((item) => item.watched || item.status === 'watched').length;
  const unwatched = items.length - watched;
  const favorites = items.filter((item) => item.favorite).length;
  const priority = items.filter((item) => item.priority).length;
  els.summaryGrid.innerHTML = [
    { value: items.length, label: 'Total titles' },
    { value: unwatched, label: 'Not watched' },
    { value: favorites, label: 'Favorites' },
    { value: priority, label: 'Priority' },
  ].map(card => `
    <article class="stat-card">
      <div class="stat-value">${card.value}</div>
      <div class="stat-label">${card.label}</div>
    </article>
  `).join('');
}

function renderSuggestion(visible) {
  const suggestion = visible.find((item) => item.priority) || visible.find((item) => !item.watched && item.status !== 'watched') || visible[0];
  if (!suggestion) {
    els.suggestionTitle.textContent = 'Nothing yet';
    els.suggestionText.textContent = 'Add items and let the app suggest the next watch.';
    return;
  }
  els.suggestionTitle.textContent = suggestion.title;
  els.suggestionText.textContent = `${prettyType(suggestion.type)} • ${suggestion.year || 'Unknown year'} • ${prettyStatus(suggestion.status)}${suggestion.favorite ? ' • Favorite' : ''}`;
}

function renderMeta(visible) {
  const total = state.items.length;
  const visibleCount = visible.length;
  const watched = state.items.filter((item) => item.watched || item.status === 'watched').length;
  els.catalogHeading.textContent = state.ui.search ? `Results for “${state.ui.search}”` : 'All titles';
  els.catalogMeta.textContent = total
    ? `${visibleCount} visible of ${total} titles • ${watched} watched • last updated ${lastUpdatedLabel()}`
    : 'No titles saved yet.';
}

function lastUpdatedLabel() {
  const latest = [...state.items].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  if (!latest) return '—';
  return `${latest.title}`;
}

function renderCatalog(visible) {
  els.emptyState.classList.toggle('hidden', visible.length > 0 || state.items.length > 0);
  if (!visible.length) {
    els.catalogGrid.innerHTML = '';
    return;
  }

  els.catalogGrid.innerHTML = visible.map((item) => `
    <article class="card">
      <div class="floating-action">
        <button class="fab-mini" data-fav="${item.id}" aria-label="Toggle favorite">${item.favorite ? '★' : '☆'}</button>
        <button class="fab-mini" data-open="${item.id}" aria-label="Open details">↗</button>
      </div>
      <div class="poster">${posterMarkup(item, true)}</div>
      <div class="card-body">
        <div class="card-badges">
          <span class="badge accent">${escapeHtml(prettyType(item.type))}</span>
          <span class="badge ${statusBadgeClass(item.status)}">${escapeHtml(prettyStatus(item.status))}</span>
          ${item.priority ? '<span class="badge warn">Priority</span>' : ''}
          ${item.favorite ? '<span class="badge good">Favorite</span>' : ''}
        </div>
        <h4 class="card-title">${escapeHtml(item.title)}</h4>
        <div class="card-meta">
          <span>${escapeHtml(item.year || 'Unknown year')}</span>
          <span>${escapeHtml(item.label !== 'none' ? prettyLabel(item.label) : 'No label')}</span>
        </div>
        <p class="small-note">${escapeHtml(shortSynopsis(item.synopsis))}</p>
        <div class="card-actions">
          <button class="ghost-btn" data-watch="${item.id}">${item.watched || item.status === 'watched' ? 'Mark unseen' : 'Mark watched'}</button>
          <button class="ghost-btn" data-edit="${item.id}">Edit</button>
        </div>
      </div>
    </article>
  `).join('');

  els.catalogGrid.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openDetailModal(getItem(btn.dataset.open))));
  els.catalogGrid.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openDetailModal(getItem(btn.dataset.edit), true)));
  els.catalogGrid.querySelectorAll('[data-fav]').forEach((btn) => btn.addEventListener('click', () => toggleFavorite(btn.dataset.fav)));
  wirePosterFallbacks(els.catalogGrid);
  els.catalogGrid.querySelectorAll('[data-watch]').forEach((btn) => btn.addEventListener('click', () => toggleWatched(btn.dataset.watch)));
}

function prettyType(type) { return type === 'series' ? 'Series' : 'Movie'; }
function prettyLabel(label) { return ({ me: 'Mine', her: 'Hers', ours: 'Both' })[label] || 'No label'; }
function prettyStatus(status) { return ({ want: 'Want to watch', watching: 'Watching', watched: 'Watched', paused: 'Paused', dropped: 'Dropped' })[status] || 'Want to watch'; }
function prettyContext(context) { return ({ both: 'Both', together: 'Together', distance: 'Distance' })[context] || 'Both'; }
function statusBadgeClass(status) { return ({ want: 'accent', watching: 'warn', watched: 'good', paused: 'warn', dropped: 'danger' })[status] || 'accent'; }

function shortSynopsis(text = '') {
  if (!text) return 'No synopsis yet.';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 115 ? `${clean.slice(0, 112)}…` : clean;
}

function posterMarkup(item, fallbackCompact = false) {
  const poster = item.poster && item.poster !== 'N/A' ? item.poster : '';
  if (!poster) return posterFallbackMarkup(item, fallbackCompact);
  return `<img src="${escapeHtml(poster)}" alt="${escapeHtml(item.title)} poster" loading="lazy" data-poster-title="${escapeHtml(item.title)}" data-poster-year="${escapeHtml(item.year || '')}" data-poster-type="${escapeHtml(item.type || 'movie')}" />`;
}

function wirePosterFallbacks(root = document) {
  root.querySelectorAll('img[data-poster-title]').forEach((img) => {
    if (img.dataset.boundPosterFallback === '1') return;
    img.dataset.boundPosterFallback = '1';
    img.addEventListener('error', () => {
      const item = {
        title: img.dataset.posterTitle || 'Untitled',
        year: img.dataset.posterYear || '',
        type: img.dataset.posterType || 'movie',
      };
      const fallback = document.createElement('div');
      fallback.innerHTML = posterFallbackMarkup(item, false);
      img.replaceWith(fallback.firstElementChild);
    });
  });
}

function posterFallbackMarkup(item, compact = false) {
  return `
    <div class="poster-fallback ${compact ? 'compact' : ''}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.year || 'Unknown year')} • ${escapeHtml(prettyType(item.type))}</span>
    </div>
  `;
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="empty-state"><p class="subtle">No history yet. Watched titles and random picks will appear here.</p></div>`;
    return;
  }

  els.historyList.innerHTML = state.history.slice(0, 8).map((entry) => {
    const item = getItem(entry.itemId);
    return `
      <div class="history-item">
        <div>
          <strong>${escapeHtml(item?.title || entry.title || 'Unknown title')}</strong>
          <span class="subtle">${escapeHtml(entry.action)} • ${new Date(entry.createdAt).toLocaleString()}</span>
        </div>
        <button class="ghost-btn" data-history-open="${entry.itemId}">Open</button>
      </div>
    `;
  }).join('');

  els.historyList.querySelectorAll('[data-history-open]').forEach((btn) => btn.addEventListener('click', () => openDetailModal(getItem(btn.dataset.historyOpen))));
}

function addHistory(item, action) {
  if (!item) return;
  state.history.unshift({ id: uid(), itemId: item.id, title: item.title, action, createdAt: nowISO() });
  state.history = state.history.slice(0, 50);
  state.settings.lastViewedItemId = item.id;
  saveState(true);
}

function toggleFavorite(id) {
  const item = getItem(id);
  if (!item) return;
  item.favorite = !item.favorite;
  item.updatedAt = nowISO();
  if (item.favorite && item.status === 'dropped') item.status = 'want';
  saveState(true);
  render();
  toast(item.favorite ? 'Added to favorites' : 'Removed from favorites');
}

function toggleWatched(id) {
  const item = getItem(id);
  if (!item) return;
  const becomingWatched = !(item.watched || item.status === 'watched');
  item.watched = becomingWatched;
  item.status = becomingWatched ? 'watched' : 'want';
  item.watchedAt = becomingWatched ? nowISO() : null;
  item.updatedAt = nowISO();
  addHistory(item, becomingWatched ? 'Marked watched' : 'Marked unseen');
  render();
  toast(becomingWatched ? 'Marked watched' : 'Marked unseen');
}

function upsertItem(data) {
  const existing = data.id ? getItem(data.id) : null;
  if (existing) {
    Object.assign(existing, data, { updatedAt: nowISO() });
    return existing;
  }
  const item = {
    id: uid(),
    imdbID: data.imdbID || '',
    title: data.title || 'Untitled',
    originalTitle: data.originalTitle || data.title || '',
    type: data.type || 'movie',
    year: data.year || '',
    poster: data.poster || '',
    synopsis: data.synopsis || '',
    genre: data.genre || '',
    runtime: data.runtime || '',
    rating: data.rating || '',
    actors: data.actors || '',
    language: data.language || '',
    country: data.country || '',
    director: data.director || '',
    writer: data.writer || '',
    released: data.released || '',
    awards: data.awards || '',
    label: data.label || 'none',
    context: data.context || 'both',
    status: data.status || 'want',
    favorite: Boolean(data.favorite),
    priority: Boolean(data.priority),
    suggestedBy: data.suggestedBy || 'none',
    notes: data.notes || '',
    reason: data.reason || '',
    watched: Boolean(data.watched),
    watchedAt: data.watchedAt || null,
    lastOpenedAt: data.lastOpenedAt || null,
    createdAt: data.createdAt || nowISO(),
    updatedAt: data.updatedAt || nowISO(),
    raw: data.raw || {},
  };
  state.items.unshift(item);
  return item;
}

function mapOmdbToItem(raw, base = {}) {
  return {
    imdbID: raw.imdbID || base.imdbID || '',
    title: raw.Title || base.title || 'Untitled',
    originalTitle: raw.Title || base.originalTitle || raw.Title || '',
    type: (raw.Type || base.type || 'movie').toLowerCase(),
    year: raw.Year || base.year || '',
    poster: raw.Poster || base.poster || '',
    synopsis: raw.Plot || base.synopsis || '',
    genre: raw.Genre || base.genre || '',
    runtime: raw.Runtime || base.runtime || '',
    rating: raw.imdbRating || base.rating || '',
    actors: raw.Actors || base.actors || '',
    language: raw.Language || base.language || '',
    country: raw.Country || base.country || '',
    director: raw.Director || base.director || '',
    writer: raw.Writer || base.writer || '',
    released: raw.Released || base.released || '',
    awards: raw.Awards || base.awards || '',
    raw,
  };
}

function openAddModal() {
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Add title</p>
            <h3>Search OMDb and add the right match</h3>
            <p class="subtle">Search by title or IMDb ID. If the API is slow or unavailable, manual entry still works.</p>
          </div>
          <button class="ghost-btn" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="search-row">
            <input id="addSearchInput" type="search" placeholder="Search a movie or series..." />
            <button id="addSearchBtn" class="primary-btn">Search</button>
          </div>
          <div class="row-actions">
            <div class="chip-row" id="searchModeChips">
              <button class="chip active" data-mode="title">Title</button>
              <button class="chip" data-mode="id">IMDb ID</button>
            </div>
            <button id="manualAddBtn" class="ghost-btn">Manual add</button>
          </div>
          <div id="searchStatus" class="subtle"></div>
          <div id="searchResults" class="list-results"></div>
        </div>
      </div>
    </div>`;
  openModal(html);
  const input = $('addSearchInput');
  const btn = $('addSearchBtn');
  const results = $('searchResults');
  const status = $('searchStatus');
  const manual = $('manualAddBtn');
  const modeChips = $('searchModeChips');
  let mode = 'title';

  const doSearch = async () => {
    const q = input.value.trim();
    if (!q) {
      status.textContent = 'Type something to search.';
      results.innerHTML = '';
      return;
    }
    status.textContent = 'Searching...';
    results.innerHTML = '';
    try {
      const data = mode === 'id' ? await omdbRequest({ i: q, plot: 'full' }) : await omdbRequest({ s: q, page: 1 });
      renderSearchResults(data, results, status, q);
    } catch (err) {
      console.error(err);
      status.textContent = 'OMDb did not respond. You can still add the item manually.';
      results.innerHTML = '';
    }
  };

  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
  modeChips.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-mode]');
    if (!chip) return;
    mode = chip.dataset.mode;
    modeChips.querySelectorAll('.chip').forEach((el) => el.classList.toggle('active', el === chip));
    input.placeholder = mode === 'id' ? 'Paste an IMDb ID like tt0133093' : 'Search a movie or series...';
    status.textContent = '';
  });
  manual.addEventListener('click', () => openEditorModal({ title: input.value.trim() || '', type: 'movie' }, null, true));
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  setTimeout(() => input.focus(), 20);
}

function renderSearchResults(data, container, status, q) {
  if (data?.Search?.length) {
    status.textContent = `Found ${data.Search.length} result${data.Search.length > 1 ? 's' : ''}.`;
    container.innerHTML = data.Search.map((entry) => `
      <div class="result-item">
        <div class="result-thumb">${entry.Poster && entry.Poster !== 'N/A' ? `<img src="${escapeHtml(entry.Poster)}" alt="${escapeHtml(entry.Title)} poster" />` : posterFallbackMarkup({ title: entry.Title, year: entry.Year, type: entry.Type }, true)}</div>
        <div>
          <h4>${escapeHtml(entry.Title)}</h4>
          <p>${escapeHtml(entry.Year || 'Unknown year')} • ${escapeHtml(prettyType(entry.Type))} • ${escapeHtml(entry.imdbID)}</p>
        </div>
        <button class="primary-btn" data-add-result="${entry.imdbID}">Add</button>
      </div>
    `).join('');
    container.querySelectorAll('[data-add-result]').forEach((btn) => btn.addEventListener('click', () => addFromOmdbId(btn.dataset.addResult)));
  wirePosterFallbacks(container);
  } else if (data?.Title || data?.imdbID) {
    status.textContent = 'Single match found.';
    container.innerHTML = `
      <div class="result-item">
        <div class="result-thumb">${data.Poster && data.Poster !== 'N/A' ? `<img src="${escapeHtml(data.Poster)}" alt="${escapeHtml(data.Title)} poster" />` : posterFallbackMarkup({ title: data.Title, year: data.Year, type: data.Type }, true)}</div>
        <div>
          <h4>${escapeHtml(data.Title)}</h4>
          <p>${escapeHtml(data.Year || 'Unknown year')} • ${escapeHtml(prettyType(data.Type))} • ${escapeHtml(data.imdbID)}</p>
        </div>
        <button class="primary-btn" data-add-result="${data.imdbID}">Add</button>
      </div>
    `;
    container.querySelector('[data-add-result]').addEventListener('click', () => addFromOmdbId(data.imdbID));
  } else {
    status.textContent = `No results for “${q}”. Try another title or add manually.`;
    container.innerHTML = '';
  }
}

async function addFromOmdbId(imdbID) {
  try {
    const raw = await omdbRequest({ i: imdbID, plot: 'full' });
    if (raw?.Response === 'False') throw new Error(raw?.Error || 'OMDb error');
    const base = mapOmdbToItem(raw, { imdbID });
    openEditorModal(base, raw, true);
  } catch (err) {
    toast('Could not fetch OMDb details');
  }
}

function openEditorModal(base = {}, raw = null, isNew = false) {
  const item = base.id ? getItem(base.id) : null;
  const model = item || base;
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">${isNew ? 'New item' : 'Edit item'}</p>
            <h3>${escapeHtml(model.title || 'Untitled')}</h3>
            <p class="subtle">Fill the details you care about. Everything is editable later.</p>
          </div>
          <button class="ghost-btn" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="modal-grid">
            <div class="detail-poster">${posterMarkup(model)}</div>
            <div class="detail-meta">
              <div class="form-grid">
                ${textField('title', 'Title', model.title || '')}
                ${textField('originalTitle', 'Original title', model.originalTitle || '')}
                ${textField('imdbID', 'IMDb ID', model.imdbID || '')}
                ${selectField('type', 'Type', TYPES.slice(1), model.type || 'movie')}
                ${textField('year', 'Year', model.year || '')}
                ${textField('runtime', 'Runtime', model.runtime || '')}
                ${textField('rating', 'Rating', model.rating || '')}
                ${textField('genre', 'Genre', model.genre || '')}
                ${textField('actors', 'Cast', model.actors || '', true)}
                ${textField('language', 'Language', model.language || '')}
                ${textField('country', 'Country', model.country || '')}
                ${selectField('label', 'Label', LABELS, model.label || 'none')}
                ${selectField('context', 'Context', CONTEXTS, model.context || 'both')}
                ${selectField('status', 'Status', STATUSES, model.status || 'want')}
                ${selectField('suggestedBy', 'Suggested by', [
                  { value: 'none', label: 'No one' },
                  { value: 'me', label: 'Me' },
                  { value: 'her', label: 'Her' },
                  { value: 'both', label: 'Both' },
                ], model.suggestedBy || 'none')}
                ${checkField('favorite', 'Favorite', Boolean(model.favorite))}
                ${checkField('priority', 'Priority', Boolean(model.priority))}
                ${checkField('watched', 'Already watched', Boolean(model.watched))}
                <div class="full">${textField('released', 'Released', model.released || '')}</div>
                <div class="full">${textareaField('synopsis', 'Synopsis', model.synopsis || '')}</div>
                <div class="full">${textareaField('notes', 'Personal notes', model.notes || '')}</div>
                <div class="full">${textareaField('reason', 'Why we want it', model.reason || '')}</div>
                <div class="full">${textareaField('awards', 'Awards / extras', model.awards || '')}</div>
              </div>
              <div class="row-actions">
                <div class="small-note">${model.raw ? 'Cached OMDb data is saved with the item.' : 'Manual entry selected.'}</div>
                <div class="hero-actions">
                  <button id="deleteItemBtn" class="ghost-btn ${isNew ? 'hidden' : ''}">Delete</button>
                  <button id="saveItemBtn" class="primary-btn">Save</button>
                </div>
              </div>
              <div class="small-note">Tip: use <strong>Priority</strong> for the next watch and <strong>Label</strong> for who suggested it.</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  openModal(html);
  const close = document.querySelector('[data-close-modal]');
  close?.addEventListener('click', closeModal);

  const get = (name) => document.querySelector(`[name="${name}"]`);
  const collect = () => ({
    id: item?.id,
    imdbID: get('imdbID').value.trim(),
    title: get('title').value.trim() || 'Untitled',
    originalTitle: get('originalTitle').value.trim(),
    type: get('type').value,
    year: get('year').value.trim(),
    poster: model.poster || '',
    synopsis: get('synopsis').value.trim(),
    genre: get('genre').value.trim(),
    runtime: get('runtime').value.trim(),
    rating: get('rating').value.trim(),
    actors: get('actors').value.trim(),
    language: get('language').value.trim(),
    country: get('country').value.trim(),
    released: get('released').value.trim(),
    awards: get('awards').value.trim(),
    label: get('label').value,
    context: get('context').value,
    status: get('status').value,
    suggestedBy: get('suggestedBy').value,
    favorite: get('favorite').checked,
    priority: get('priority').checked,
    watched: get('watched').checked || get('status').value === 'watched',
    notes: get('notes').value.trim(),
    reason: get('reason').value.trim(),
    raw: raw || model.raw || {},
    watchedAt: get('watched').checked ? (item?.watchedAt || nowISO()) : null,
  });

  $('saveItemBtn').addEventListener('click', () => {
    const data = collect();
    const existing = item || null;
    const saved = existing ? Object.assign(existing, data, { updatedAt: nowISO() }) : upsertItem(data);
    if (data.watched && !saved.watchedAt) saved.watchedAt = nowISO();
    if (data.watched) saved.watched = true;
    saved.updatedAt = nowISO();
    state.settings.lastViewedItemId = saved.id;
    addHistory(saved, isNew ? 'Added item' : 'Edited item');
    saveState(true);
    render();
    closeModal();
    toast(isNew ? 'Item added' : 'Item saved');
  });

  const del = $('deleteItemBtn');
  del?.addEventListener('click', () => {
    if (!item) return;
    if (!confirm(`Delete ${item.title}?`)) return;
    state.items = state.items.filter((x) => x.id !== item.id);
    state.history = state.history.filter((x) => x.itemId !== item.id);
    saveState(true);
    closeModal();
    render();
    toast('Item deleted');
  });

  state.settings.lastViewedItemId = item?.id || state.settings.lastViewedItemId;
  saveState();
}

function textField(name, label, value, wide = false) {
  return `
    <label class="${wide ? 'full' : ''}">
      <span class="small-note">${escapeHtml(label)}</span>
      <input name="${name}" type="text" value="${escapeHtml(value)}" />
    </label>`;
}

function textareaField(name, label, value) {
  return `
    <label class="full">
      <span class="small-note">${escapeHtml(label)}</span>
      <textarea name="${name}">${escapeHtml(value)}</textarea>
    </label>`;
}

function selectField(name, label, options, value) {
  return `
    <label>
      <span class="small-note">${escapeHtml(label)}</span>
      <select name="${name}">${options.map(opt => `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}</select>
    </label>`;
}

function checkField(name, label, checked) {
  return `
    <label style="display:flex; align-items:center; gap:10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-strong);">
      <input name="${name}" type="checkbox" ${checked ? 'checked' : ''} style="width:18px; height:18px;" />
      <span>${escapeHtml(label)}</span>
    </label>`;
}

function openDetailModal(item, editing = false) {
  if (!item) return;
  item.lastOpenedAt = nowISO();
  state.settings.lastViewedItemId = item.id;
  saveState(true);
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Details</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="subtle">${escapeHtml(prettyType(item.type))} • ${escapeHtml(item.year || 'Unknown year')} • ${escapeHtml(item.imdbID || '')}</p>
          </div>
          <div class="hero-actions">
            <button class="ghost-btn" data-open-edit>Full edit</button>
            <button class="ghost-btn" data-close-modal>Close</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="modal-grid">
            <div class="detail-poster">${posterMarkup(item)}</div>
            <div class="detail-meta">
              <h2 class="detail-title">${escapeHtml(item.title)}</h2>
              ${item.originalTitle && item.originalTitle !== item.title ? `<p class="subtle">Original title: ${escapeHtml(item.originalTitle)}</p>` : ''}
              <div class="detail-stats">
                <span class="badge accent">${escapeHtml(prettyType(item.type))}</span>
                <span class="badge ${statusBadgeClass(item.status)}">${escapeHtml(prettyStatus(item.status))}</span>
                ${item.favorite ? '<span class="badge good">Favorite</span>' : ''}
                ${item.priority ? '<span class="badge warn">Priority</span>' : ''}
                <span class="badge">${escapeHtml(item.year || 'Unknown year')}</span>
                <span class="badge">${escapeHtml(prettyContext(item.context))}</span>
                <span class="badge">${escapeHtml(prettyLabel(item.label))}</span>
              </div>
              <p>${escapeHtml(item.synopsis || 'No synopsis saved yet.')}</p>
              <div class="inline-kv">
                <strong>Runtime</strong><span>${escapeHtml(item.runtime || '—')}</span>
                <strong>Genre</strong><span>${escapeHtml(item.genre || '—')}</span>
                <strong>Rating</strong><span>${escapeHtml(item.rating || '—')}</span>
                <strong>Cast</strong><span>${escapeHtml(item.actors || '—')}</span>
                <strong>Language</strong><span>${escapeHtml(item.language || '—')}</span>
                <strong>Country</strong><span>${escapeHtml(item.country || '—')}</span>
                <strong>Suggested by</strong><span>${escapeHtml(prettySuggestion(item.suggestedBy))}</span>
                <strong>Watched</strong><span>${item.watched || item.status === 'watched' ? 'Yes' : 'No'}</span>
              </div>
              <div class="card-actions">
                <button class="ghost-btn" data-toggle-fav>${item.favorite ? 'Unfavorite' : 'Favorite'}</button>
                <button class="ghost-btn" data-toggle-watch>${item.watched || item.status === 'watched' ? 'Mark unseen' : 'Mark watched'}</button>
                <button class="ghost-btn" data-toggle-priority>${item.priority ? 'Remove priority' : 'Set priority'}</button>
              </div>
            </div>
          </div>
          <div class="panel" style="background: var(--panel-strong);">
            <div class="panel-head"><div><p class="eyebrow">Notes</p><h3>Personal context</h3></div></div>
            <p class="small-note"><strong>Why we want it:</strong> ${escapeHtml(item.reason || '—')}</p>
            <p class="small-note"><strong>Notes:</strong> ${escapeHtml(item.notes || '—')}</p>
            <p class="small-note"><strong>Extras:</strong> ${escapeHtml(item.awards || '—')}</p>
          </div>
        </div>
      </div>
    </div>`;
  openModal(html);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.querySelector('[data-open-edit]')?.addEventListener('click', () => openEditorModal(item, item.raw, false));
  wirePosterFallbacks(els.modalRoot);
  document.querySelector('[data-toggle-fav]')?.addEventListener('click', () => { toggleFavorite(item.id); closeModal(); });
  document.querySelector('[data-toggle-watch]')?.addEventListener('click', () => { toggleWatched(item.id); closeModal(); });
  document.querySelector('[data-toggle-priority]')?.addEventListener('click', () => {
    item.priority = !item.priority;
    item.updatedAt = nowISO();
    saveState(true);
    render();
    toast(item.priority ? 'Priority enabled' : 'Priority removed');
    closeModal();
  });
}

function prettySuggestion(s) {
  return ({ me: 'Me', her: 'Her', both: 'Both', none: 'No one' })[s] || 'No one';
}

function drawRandom() {
  const pool = getVisibleItems().filter((item) => item.status !== 'dropped');
  if (!pool.length) { toast('Nothing matches the current filters'); return; }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  state.settings.lastRandomPickId = pick.id;
  addHistory(pick, 'Random pick');
  saveState(true);
  openPickModal(pick, pool.length);
}

function openPickModal(item, poolSize) {
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Random pick</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="subtle">Chosen from ${poolSize} visible titles.</p>
          </div>
          <button class="ghost-btn" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="modal-grid">
            <div class="detail-poster">${posterMarkup(item)}</div>
            <div class="detail-meta">
              <h2 class="detail-title">${escapeHtml(item.title)}</h2>
              <div class="detail-stats">
                <span class="badge accent">${escapeHtml(prettyType(item.type))}</span>
                <span class="badge ${statusBadgeClass(item.status)}">${escapeHtml(prettyStatus(item.status))}</span>
                <span class="badge">${escapeHtml(item.year || 'Unknown year')}</span>
                ${item.priority ? '<span class="badge warn">Priority</span>' : ''}
                ${item.favorite ? '<span class="badge good">Favorite</span>' : ''}
              </div>
              <p>${escapeHtml(shortSynopsis(item.synopsis))}</p>
              <div class="compare-actions">
                <button class="primary-btn" data-watch-picked>Mark as watched</button>
                <button class="ghost-btn" data-open-picked>Open details</button>
                <button class="ghost-btn" data-draw-again>Draw again</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  openModal(html);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.querySelector('[data-watch-picked]')?.addEventListener('click', () => { toggleWatched(item.id); closeModal(); });
  wirePosterFallbacks(els.modalRoot);
  document.querySelector('[data-open-picked]')?.addEventListener('click', () => openDetailModal(item));
  document.querySelector('[data-draw-again]')?.addEventListener('click', () => { closeModal(); drawRandom(); });
}

function openCompareModal() {
  const pool = getVisibleItems().filter((item) => item.status !== 'dropped');
  if (pool.length < 2) {
    toast('Need at least two visible titles');
    return;
  }
  const a = pool[0];
  const b = pool[1];
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Decision mode</p>
            <h3>Compare two titles</h3>
            <p class="subtle">A fast side-by-side view for choosing the next watch.</p>
          </div>
          <button class="ghost-btn" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="compare-grid">
            ${compareCardMarkup(a, 'A')}
            ${compareCardMarkup(b, 'B')}
          </div>
        </div>
      </div>
    </div>`;
  openModal(html);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  document.querySelectorAll('[data-pick-item]').forEach((btn) => btn.addEventListener('click', () => {
    const item = getItem(btn.dataset.pickItem);
    if (!item) return;
    addHistory(item, 'Chosen in comparison');
    state.settings.lastViewedItemId = item.id;
    saveState(true);
    openDetailModal(item);
  }));
}

function compareCardMarkup(item, label) {
  return `
    <div class="compare-card">
      <span class="badge accent">Option ${label}</span>
      <div style="margin-top:10px;">${posterMarkup(item)}</div>
      <h4>${escapeHtml(item.title)}</h4>
      <div class="inline-kv" style="margin-top: 10px;">
        <strong>Type</strong><span>${escapeHtml(prettyType(item.type))}</span>
        <strong>Year</strong><span>${escapeHtml(item.year || '—')}</span>
        <strong>Rating</strong><span>${escapeHtml(item.rating || '—')}</span>
        <strong>Label</strong><span>${escapeHtml(prettyLabel(item.label))}</span>
        <strong>Context</strong><span>${escapeHtml(prettyContext(item.context))}</span>
      </div>
      <p class="small-note">${escapeHtml(shortSynopsis(item.synopsis))}</p>
      <div class="compare-actions">
        <button class="primary-btn" data-pick-item="${item.id}">Pick this one</button>
        <button class="ghost-btn" onclick="location.hash='item/${item.id}'">Open</button>
      </div>
    </div>`;
}

function openBackupModal() {
  const html = `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Backup</p>
            <h3>Export or restore your catalog</h3>
            <p class="subtle">Keep a JSON copy on your phone or drive.</p>
          </div>
          <button class="ghost-btn" data-close-modal>Close</button>
        </div>
        <div class="modal-body">
          <div class="row-actions">
            <button id="downloadBackupBtn" class="primary-btn">Download backup</button>
            <label class="ghost-btn" style="display:inline-flex; align-items:center; gap: 8px;">
              Restore backup
              <input id="restoreFile" type="file" accept="application/json" style="display:none;" />
            </label>
          </div>
          <p class="small-note">The backup includes items, history, settings, and cache. OMDb keys never leave the server function.</p>
        </div>
      </div>
    </div>`;
  openModal(html);
  document.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  $('downloadBackupBtn')?.addEventListener('click', downloadBackup);
  $('restoreFile')?.addEventListener('change', restoreBackup);
}

function downloadBackup() {
  const payload = JSON.stringify({
    exportedAt: nowISO(),
    version: APP_VERSION,
    items: state.items,
    history: state.history,
    settings: state.settings,
    cache: state.cache,
  }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `couple-catalog-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  toast('Backup downloaded');
}

function restoreBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || '{}'));
      state.items = Array.isArray(data.items) ? data.items : [];
      state.history = Array.isArray(data.history) ? data.history : [];
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.cache = data.cache && typeof data.cache === 'object' ? data.cache : {};
      normalizeLegacyData();
      saveState(true);
      applyTheme();
      setupSelects();
      render();
      closeModal();
      toast('Backup restored');
    } catch (err) {
      toast('Invalid backup file');
    }
  };
  reader.readAsText(file);
}

function omdbCacheKey(params) {
  const ordered = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  return ordered;
}

async function omdbRequest(params) {
  const key = omdbCacheKey(params);
  const cached = state.cache[key];
  const ttl = 1000 * 60 * 60 * 24 * 7;
  if (cached && Date.now() - cached.at < ttl) return cached.data;

  const url = new URL(API_ENDPOINT, location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && `${v}`.length) url.searchParams.set(k, v); });
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  state.cache[key] = { at: Date.now(), data };
  saveState();
  return data;
}

document.addEventListener('DOMContentLoaded', init);
