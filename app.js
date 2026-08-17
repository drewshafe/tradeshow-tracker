// State
let shows = [];
let reps = [];
let currentShowId = null;
let currentRepId = null;
let currentListType = LIST_TYPES.HIT_LIST;
let currentBoothId = null;
let booths = [];
let sortBy = 'booth';
let searchQuery = '';
const DEFAULT_FILTERS = { platforms: [], statuses: [], protections: [], returns: [], helpDesks: [], subscriptions: [], minRevenue: 0, hall: 'all' };
let filters = { ...DEFAULT_FILTERS };
let tempFilters = { ...filters, platforms: [], statuses: [], protections: [], returns: [], helpDesks: [], subscriptions: [] };
let pendingImportData = null;
let columnMapping = {};
let cameraStream = null;
let listScrollPosition = 0; // Track scroll position

// Hall options for filtering
const HALL_OPTIONS = [
  { value: 'all', label: 'All Halls' },
  { value: 'Hall A', label: 'Hall A' },
  { value: 'Hall B', label: 'Hall B' },
  { value: 'Hall C', label: 'Hall C' },
  { value: 'Hall D', label: 'Hall D' },
  { value: 'Hall E', label: 'Hall E (Lower)' },
  { value: 'North Hall', label: 'North Hall' },
  { value: 'Plaza', label: 'Plaza' },
  { value: 'Level 3', label: 'Level 3' }
];

// Filter persistence helpers
function getFilterStorageKey() {
  return `tst_filters_${currentShowId}_${currentRepId}_${currentListType}`;
}

function saveFilters() {
  if (!currentShowId || !currentRepId) return;
  try {
    localStorage.setItem(getFilterStorageKey(), JSON.stringify(filters));
    localStorage.setItem(`tst_sortBy_${currentShowId}_${currentRepId}`, sortBy);
  } catch (e) { console.warn('Could not save filters:', e); }
}

function loadFilters() {
  if (!currentShowId || !currentRepId) return;
  try {
    const saved = localStorage.getItem(getFilterStorageKey());
    if (saved) {
      const parsed = JSON.parse(saved);
      filters = { ...DEFAULT_FILTERS, ...parsed };
      // Sanitize: old format stored returns/protection as strings — reset any non-array field to []
      const arrayFields = ['platforms', 'statuses', 'protections', 'returns', 'helpDesks', 'subscriptions'];
      arrayFields.forEach(k => { if (!Array.isArray(filters[k])) filters[k] = []; });
      tempFilters = { ...filters, platforms: [...filters.platforms], statuses: [...filters.statuses], protections: [...filters.protections], returns: [...filters.returns], helpDesks: [...filters.helpDesks], subscriptions: [...filters.subscriptions] };
    } else {
      filters = { ...DEFAULT_FILTERS };
      tempFilters = { ...filters, platforms: [], statuses: [], protections: [], returns: [], helpDesks: [], subscriptions: [] };
    }
    const savedSort = localStorage.getItem(`tst_sortBy_${currentShowId}_${currentRepId}`);
    if (savedSort) sortBy = savedSort;
  } catch (e) {
    console.warn('Could not load filters:', e);
    filters = { ...DEFAULT_FILTERS };
    tempFilters = { ...filters, platforms: [], statuses: [], protections: [], returns: [], helpDesks: [], subscriptions: [] };
  }
}

// Helper to get app badge (EcoCart or ShipInsure)
function getAppBadge(appInstalled, productOffering) {
  const app = (appInstalled || productOffering || '').toLowerCase();
  if (app.includes('ecocart')) {
    return '<span class="app-badge ecocart">EcoCart</span>';
  } else if (app.includes('shipinsure') || app.includes('ship insure')) {
    return '<span class="app-badge shipinsure">ShipInsure</span>';
  }
  return '';
}

// Helper to get status icon
function getStatusIcon(status) {
  switch(status) {
    case STATUS.NOT_VISITED: return 'circle';
    case STATUS.COME_BACK: return 'redo-alt';
    case STATUS.FOLLOW_UP_WARM: return 'fire';
    case STATUS.FOLLOW_UP_WARM_DIRECT: return 'fire';
    case STATUS.FOLLOW_UP_WARM_INTRO: return 'random';
    case STATUS.FOLLOW_UP_COLD: return 'snowflake';
    case STATUS.DEMO_BOOKED: return 'calendar-check';
    case STATUS.NOT_INTERESTED: return 'thumbs-down';
    case STATUS.DQ: return 'ban';
    case STATUS.NOT_AT_SHOW: return 'store-slash';
    default: return 'circle';
  }
}

// Helper to determine hall/level from booth number
// Uses per-show hall_config if available, otherwise falls back to defaults
function getBoothHall(boothNumber, showId) {
  if (!boothNumber) return null;
  const num = boothNumber.toString().toUpperCase().trim();
  
  // Get show-specific hall config
  const show = shows.find(s => s.id === (showId || currentShowId));
  const hallConfig = show?.hallConfig || show?.hall_config;
  
  // If show has custom hall config, use it
  if (hallConfig && hallConfig.rules && hallConfig.rules.length > 0) {
    for (const rule of hallConfig.rules) {
      if (rule.prefix && num.startsWith(rule.prefix.toUpperCase())) {
        // Check numeric range if specified
        if (rule.minNum !== undefined || rule.maxNum !== undefined) {
          const numericPart = parseInt(num.substring(rule.prefix.length));
          if (!isNaN(numericPart)) {
            const min = rule.minNum ?? 0;
            const max = rule.maxNum ?? 999999;
            if (numericPart >= min && numericPart <= max) {
              return { hall: rule.hall, level: rule.level || '', category: rule.category || '' };
            }
          }
        } else {
          return { hall: rule.hall, level: rule.level || '', category: rule.category || '' };
        }
      } else if (!rule.prefix && rule.minNum !== undefined) {
        // Numeric-only rule (no prefix)
        const numericBooth = parseInt(num);
        if (!isNaN(numericBooth)) {
          const min = rule.minNum ?? 0;
          const max = rule.maxNum ?? 999999;
          if (numericBooth >= min && numericBooth <= max) {
            return { hall: rule.hall, level: rule.level || '', category: rule.category || '' };
          }
        }
      }
    }
    return null; // Show has config but booth didn't match any rule
  }
  
  // === FALLBACK: Expo West default config (for backward compatibility) ===
  
  // F prefix booths (Plaza/Food area)
  if (num.startsWith('F')) {
    return { hall: 'Plaza', level: 'Plaza', category: 'Food Court' };
  }
  
  // North Hall booths (N prefix)
  if (num.startsWith('N')) {
    const nNum = parseInt(num.substring(1));
    if (!isNaN(nNum)) {
      if (nNum >= 100 && nNum <= 199) return { hall: 'North Hall', level: 'Level 100', category: 'Hot Products' };
      if (nNum >= 1000 && nNum <= 1299) return { hall: 'North Hall', level: 'Level 100', category: 'Hot Products' };
      if (nNum >= 1300 && nNum <= 1499) return { hall: 'North Hall', level: 'Level 200', category: 'Hot Products' };
      if (nNum >= 1500 && nNum <= 2303) return { hall: 'North Hall', level: 'Level 200', category: 'Hot Products' };
    }
    return { hall: 'North Hall', level: '', category: 'Hot Products' };
  }
  
  const numericBooth = parseInt(num);
  if (isNaN(numericBooth)) return null;
  
  // Level 3
  if (numericBooth >= 8900 && numericBooth <= 8923) return { hall: 'Level 3', level: 'Level 3', category: 'Startup CPG' };
  if (numericBooth >= 8110 && numericBooth <= 8221) return { hall: 'Level 3', level: 'Level 3', category: 'Snack Lab' };
  if (numericBooth >= 7800 && numericBooth <= 8822) return { hall: 'Level 3', level: 'Level 3', category: 'Hot Products' };
  
  // Lower Level (Hall E)
  if (numericBooth >= 4900 && numericBooth <= 5799) return { hall: 'Hall E', level: 'Lower Level', category: 'Natural & Specialty Foods' };
  
  // Level 1 - Hall D (Supplements + Natural & Specialty Foods)
  if (numericBooth >= 3387 && numericBooth <= 4899) return { hall: 'Hall D', level: 'Level 1', category: 'Supplements / Natural & Specialty Foods' };
  
  // Level 1 - Hall C (multiple categories)
  if (numericBooth >= 2772 && numericBooth <= 2897) return { hall: 'Hall C', level: 'Level 1', category: 'Wellness Beverage' };
  if (numericBooth >= 2577 && numericBooth <= 2683) return { hall: 'Hall C', level: 'Level 1', category: 'Conscious Beauty' };
  if (numericBooth >= 2301 && numericBooth <= 3199) return { hall: 'Hall C', level: 'Level 1', category: 'Lifestyle' };
  if (numericBooth >= 2486 && numericBooth <= 3199) return { hall: 'Hall C', level: 'Level 1', category: 'Natural & Specialty Foods' };
  
  // Level 1 - Hall B (Organic + Natural & Specialty Foods)
  if (numericBooth >= 1302 && numericBooth <= 2336) return { hall: 'Hall B', level: 'Level 1', category: 'Organic' };
  if (numericBooth >= 1476 && numericBooth <= 2198) return { hall: 'Hall B', level: 'Level 1', category: 'Natural & Specialty Foods' };
  
  // Level 1 - Hall A
  if (numericBooth >= 300 && numericBooth <= 1334) return { hall: 'Hall A', level: 'Level 1', category: 'Natural & Specialty Foods' };
  
  return null;
}

// Render hall config rules for admin UI
function renderHallRules(hallConfig) {
  if (!hallConfig || !hallConfig.rules || hallConfig.rules.length === 0) {
    return '<p style="color: var(--text-muted); font-size: 13px;">No hall rules configured. Click "Add Rule" to create mappings.</p>';
  }
  
  return hallConfig.rules.map((rule, idx) => `
    <div class="hall-rule-row">
      <input type="text" class="input hall-prefix" placeholder="Prefix" value="${rule.prefix || ''}" style="width: 60px;">
      <input type="number" class="input hall-min" placeholder="Min #" value="${rule.minNum ?? ''}" style="width: 70px;">
      <input type="number" class="input hall-max" placeholder="Max #" value="${rule.maxNum ?? ''}" style="width: 70px;">
      <input type="text" class="input hall-name" placeholder="Hall Name" value="${rule.hall || ''}" style="flex: 1;">
      <input type="text" class="input hall-category" placeholder="Category" value="${rule.category || ''}" style="flex: 1;">
      <button class="btn-icon delete-rule-btn"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

// Update HALL_OPTIONS based on show's hall config
function updateHallOptionsForShow(show) {
  const hallConfig = show?.hallConfig || show?.hall_config;
  
  if (hallConfig && hallConfig.rules && hallConfig.rules.length > 0) {
    // Get unique hall names from config
    const uniqueHalls = [...new Set(hallConfig.rules.map(r => r.hall).filter(Boolean))];
    
    // Rebuild HALL_OPTIONS with 'All Halls' first
    HALL_OPTIONS.length = 0;
    HALL_OPTIONS.push({ value: 'all', label: 'All Halls' });
    uniqueHalls.forEach(hall => {
      HALL_OPTIONS.push({ value: hall, label: hall });
    });
  }
}

// Get hall options for the current show (used in filter modal)
function getHallOptionsForCurrentShow() {
  const show = shows.find(s => s.id === currentShowId);
  const hallConfig = show?.hallConfig || show?.hall_config;
  
  // If show has custom hall config, use those halls
  if (hallConfig && hallConfig.rules && hallConfig.rules.length > 0) {
    const uniqueHalls = [...new Set(hallConfig.rules.map(r => r.hall).filter(Boolean))];
    const options = [{ value: 'all', label: 'All Halls' }];
    uniqueHalls.forEach(hall => {
      options.push({ value: hall, label: hall });
    });
    return options;
  }
  
  // Otherwise return the default HALL_OPTIONS (Expo West fallback)
  return HALL_OPTIONS;
}

// Format follower count
function formatFollowers(count) {
  if (!count || count === 0) return null;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

// Helper to get Aligned QR code section
function getAlignedSection() {
  const show = shows.find(s => s.id === currentShowId);
  const alignedUrl = show?.alignedRoomUrl || show?.aligned_room_url;
  if (!alignedUrl) return '';
  
  return `
    <div class="section">
      <div class="section-title">Aligned Room</div>
      <div class="aligned-qr-container">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(alignedUrl)}" alt="Scan to enter Aligned room" class="aligned-qr">
        <p class="aligned-hint">Have prospect scan to enter room</p>
        <a href="${alignedUrl}" target="_blank" class="aligned-link"><i class="fas fa-external-link-alt"></i> Open Room</a>
      </div>
    </div>
  `;
}

function getCalendarSection() {
  const rep = reps.find(r => r.id === currentRepId);
  const calendarUrl = rep?.calendarUrl || rep?.calendar_url;
  if (!calendarUrl) return '';
  
  return `
    <div class="section">
      <div class="section-title">Book a Demo - ${rep.name}</div>
      <div class="calendar-embed-container">
        <iframe src="${calendarUrl}" class="calendar-iframe" frameborder="0"></iframe>
      </div>
    </div>
  `;
}

function getFilesSection(booth) {
  const attachments = booth.attachments || [];
  
  return `
    <div class="section">
      <div class="section-title">Files & Attachments</div>
      <div class="files-container">
        ${attachments.length > 0 ? `
          <div class="files-grid">
            ${attachments.map((file, idx) => `
              <div class="file-item" data-idx="${idx}">
                ${file.type === 'image' 
                  ? `<img src="${file.url}" class="file-thumbnail" alt="${file.name}">`
                  : `<div class="file-icon"><i class="fas fa-file-pdf"></i></div>`}
                <div class="file-name">${file.name || 'File'}</div>
                <button class="file-delete-btn" data-idx="${idx}"><i class="fas fa-trash"></i></button>
              </div>
            `).join('')}
          </div>
        ` : '<p class="empty-files">No files uploaded yet</p>'}
        <div class="file-upload-area">
          <input type="file" id="file-upload-input" accept="image/*,.pdf" multiple style="display:none">
          <button class="upload-files-btn" id="upload-files-btn">
            <i class="fas fa-plus"></i> Add Files (Images or PDFs)
          </button>
        </div>
      </div>
    </div>
  `;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    await loadShows();
    setupEventListeners();
    await handleDeepLink();
  } catch (e) {
    console.error('Init error:', e);
  }
});

async function handleDeepLink() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const params = Object.fromEntries(new URLSearchParams(hash));
  const { show: showId, rep: repId, booth: boothId } = params;
  if (!showId || !repId || !boothId) return;
  // Clear the hash so reloads don't re-trigger
  history.replaceState(null, '', window.location.pathname);
  await selectShow(showId);
  await selectRep(repId);
  showDetailView(boothId);
}

window.addEventListener('beforeunload', () => releaseCamera());

function setupEventListeners() {
  // Navigation buttons
  document.getElementById('admin-btn').addEventListener('click', showAdminModal);
  document.getElementById('back-to-shows-btn').addEventListener('click', goToShows);
  document.getElementById('back-to-reps-btn').addEventListener('click', goToRepSelect);
  document.getElementById('back-to-list-btn').addEventListener('click', showListView);
  document.getElementById('back-from-dashboard-btn').addEventListener('click', goToRepSelect);
  document.getElementById('export-btn').addEventListener('click', exportDashboard);
  
  // Add Lead button
  document.getElementById('add-lead-btn').addEventListener('click', showAddLeadModal);
  
  // Filter modal
  document.getElementById('filter-btn').addEventListener('click', showFilterModal);
  document.getElementById('close-filter-btn').addEventListener('click', hideFilterModal);
  document.getElementById('clear-filters-btn').addEventListener('click', clearFilters);
  document.getElementById('apply-filters-btn').addEventListener('click', applyFilters);
  
  // List actions menu
  document.getElementById('list-actions-btn').addEventListener('click', toggleListActionsMenu);
  document.getElementById('reimport-btn').addEventListener('click', showReimportModal);
  document.getElementById('clear-list-btn').addEventListener('click', clearCurrentList);
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('list-actions-menu');
    const btn = document.getElementById('list-actions-btn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });
  
  // Admin modal
  document.getElementById('close-admin-btn').addEventListener('click', hideAdminModal);
  
  // Mapper modal
  document.getElementById('close-mapper-btn').addEventListener('click', hideMapperModal);
  document.getElementById('cancel-mapper-btn').addEventListener('click', hideMapperModal);
  document.getElementById('confirm-mapper-btn').addEventListener('click', confirmMapping);
  
  // Camera modal
  document.getElementById('close-camera-btn').addEventListener('click', closeCameraModal);
  document.getElementById('close-email-draft-btn').addEventListener('click', hideEmailDraftModal);
  document.getElementById('capture-btn').addEventListener('click', capturePhoto);
  
  // Search
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    document.getElementById('clear-search').classList.toggle('hidden', !searchQuery);
    renderBoothList();
  });
  document.getElementById('clear-search').addEventListener('click', clearSearch);
  
  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortBy = btn.dataset.sort;
      saveFilters();
      renderBoothList();
    });
  });
  
  // Shared list tabs
  setupSharedTabsListeners();
}

// ============ NAVIGATION ============

async function loadShows() {
  shows = await getShows();
  reps = await getReps();
  renderShowList();
}

function goToShows() {
  hideAllViews();
  document.getElementById('show-select-view').classList.add('active');
  renderShowList();
}

async function selectShow(showId) {
  currentShowId = showId;
  currentRepId = null;
  hideAllViews();
  document.getElementById('rep-select-view').classList.add('active');
  const show = shows.find(s => s.id === showId);
  document.getElementById('rep-select-title').textContent = show?.name || 'Select Rep';
  renderShowTabs();
  renderRepList();
}

function goToRepSelect() {
  hideAllViews();
  document.getElementById('rep-select-view').classList.add('active');
  renderShowTabs();
  renderRepList();
}

async function selectRep(repId) {
  currentRepId = repId;
  currentListType = LIST_TYPES.HIT_LIST;
  loadFilters(); // Restore saved filters for this rep
  // Hide shared tabs bar for hit lists
  document.getElementById('shared-list-tabs-bar').classList.add('hidden');
  await loadBoothList();
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
  updateListTitle();
}

async function selectListType(listType) {
  currentListType = listType;
  loadFilters(); // Restore saved filters for this list type
  await loadBoothList();
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
  updateListTitle();
}

async function showDashboard() {
  hideAllViews();
  document.getElementById('dashboard-view').classList.add('active');
  const show = shows.find(s => s.id === currentShowId);
  document.getElementById('dashboard-title').textContent = `${show?.name || ''} Dashboard`;
  await renderDashboard();
}

function showListView() {
  releaseCamera();
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
  // Restore scroll position
  requestAnimationFrame(() => {
    const list = document.getElementById('booth-list');
    if (list && listScrollPosition) list.scrollTop = listScrollPosition;
  });
}

function hideAllViews() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
}

const REP_HIT_LIST_LOGOS = {
  jason: 'jk_hitlistlogo.png',
  drew:  'DS_hitlistlogo.png',
  wyatt: 'WB_hitlistlogo.png',
};

function updateListTitle() {
  const rep = reps.find(r => r.id === currentRepId);
  const listLabel = LIST_LABELS[currentListType] || currentListType;
  const titleEl = document.getElementById('list-title');
  const logo = currentRepId && REP_HIT_LIST_LOGOS[currentRepId];
  if (logo) {
    titleEl.innerHTML = `<img src="${logo}" class="hitlist-logo" alt="${rep?.name || ''} Hit List">`;
  } else {
    titleEl.textContent = currentRepId ? `${rep?.name || 'Rep'} - ${listLabel}` : listLabel;
  }
}

// ============ SHOW LIST ============

function renderShowList() {
  const container = document.getElementById('show-list');

  if (shows.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No shows configured</p><button class="btn primary" id="add-show-empty-btn">Add Show</button></div>';
    document.getElementById('add-show-empty-btn')?.addEventListener('click', addShowPrompt);
    return;
  }

  container.innerHTML = `<div class="show-list-header"><button class="btn primary" id="add-show-top-btn"><i class="fas fa-plus"></i> Add Show</button></div>` + shows.map(show => {
    const startDate = show.startDate ? new Date(show.startDate) : null;
    const endDate = show.endDate ? new Date(show.endDate) : null;
    const dateStr = startDate && endDate 
      ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : '';
    
    return `
      <div class="show-card" data-show-id="${show.id}">
        <div class="show-info">
          <h3>${show.name}</h3>
          <p><i class="fas fa-map-marker-alt"></i> ${show.location || ''} ${dateStr ? `&nbsp; <i class="fas fa-calendar"></i> ${dateStr}` : ''}</p>
        </div>
        <i class="fas fa-chevron-right"></i>
      </div>
    `;
  }).join('');
  
  document.getElementById('add-show-top-btn')?.addEventListener('click', addShowPrompt);
  container.querySelectorAll('.show-card').forEach(card => {
    card.addEventListener('click', () => selectShow(card.dataset.showId));
  });
}

// ============ REP SELECT / TABS ============

function renderShowTabs() {
  const container = document.getElementById('show-tabs');
  const show = shows.find(s => s.id === currentShowId);
  
  container.innerHTML = `
    <button class="tab active" data-tab="reps">Rep Hit Lists</button>
    <button class="tab" data-tab="shared-lists">Shared Lists</button>
    <button class="tab" data-tab="people">People</button>
  `;
  
  container.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      
      if (tab === 'reps') {
        currentRepId = null;
        document.getElementById('shared-list-tabs-bar').classList.add('hidden');
        renderRepList();
      } else if (tab === 'shared-lists') {
        renderSharedListsView();
      } else if (tab === 'people') {
        currentRepId = null;
        currentListType = LIST_TYPES.PEOPLE;
        document.getElementById('shared-list-tabs-bar').classList.add('hidden');
        await loadPeopleList();
        hideAllViews();
        document.getElementById('list-view').classList.add('active');
        updateListTitle();
      }
    });
  });
}

function renderSharedListsView() {
  const container = document.getElementById('rep-content');
  const show = shows.find(s => s.id === currentShowId);
  
  container.innerHTML = `
    <div class="shared-lists-container">
      <p style="color: var(--text-muted); text-align: center;">Select a list type above after clicking into Shared Lists</p>
    </div>
  `;
  
  // Load customers by default
  showSharedList('customers');
}

async function showSharedList(listType) {
  const show = shows.find(s => s.id === currentShowId);
  const gsLink = show?.exhibitorList || show?.exhibitor_list || '#';
  
  // Update GS link
  const gsLinkEl = document.getElementById('gs-link');
  if (gsLinkEl) {
    gsLinkEl.href = gsLink;
    gsLinkEl.innerHTML = `<i class="fas fa-external-link-alt"></i> Full ${show?.name || 'Show'} List`;
  }
  
  // Show the tabs bar
  const tabsBar = document.getElementById('shared-list-tabs-bar');
  tabsBar.classList.remove('hidden');
  
  // Update active tab
  tabsBar.querySelectorAll('.shared-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.list === listType);
  });
  
  // Set list type and load
  const typeMap = {
    'customers': LIST_TYPES.CUSTOMERS,
    'working': LIST_TYPES.WORKING,
    'opps': LIST_TYPES.OPPS,
    'inactive': LIST_TYPES.INACTIVE_CUSTOMERS
  };
  currentRepId = null;
  currentListType = typeMap[listType];
  await loadBoothList();
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
  updateListTitle();
}

function setupSharedTabsListeners() {
  document.querySelectorAll('.shared-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showSharedList(btn.dataset.list));
  });
}

function renderRepList() {
  const container = document.getElementById('rep-content');
  const show = shows.find(s => s.id === currentShowId);
  const showReps = show?.reps || reps.map(r => r.id); // Default to all reps if not specified
  const filteredReps = reps.filter(r => showReps.includes(r.id));
  
  container.innerHTML = `
    <div class="rep-list">
      ${filteredReps.map(rep => `
        <div class="rep-card" data-rep-id="${rep.id}">
          <div class="rep-avatar">${rep.name.charAt(0)}</div>
          <span>${rep.name}</span>
          <i class="fas fa-chevron-right"></i>
        </div>
      `).join('')}
    </div>
    <button class="btn secondary dashboard-btn" id="rep-dashboard-btn" style="margin: 20px auto; display: block;">
      <i class="fas fa-chart-bar"></i> Dashboard
    </button>
  `;
  
  container.querySelectorAll('.rep-card').forEach(card => {
    card.addEventListener('click', () => selectRep(card.dataset.repId));
  });
  
  document.getElementById('rep-dashboard-btn')?.addEventListener('click', showDashboard);
}

// ============ BOOTH LIST ============

let people = []; // For people list

async function loadBoothList() {
  const config = LIST_CONFIG[currentListType];
  
  if (currentListType === LIST_TYPES.HIT_LIST && currentRepId) {
    // Hit list includes tagged Working/Opps
    booths = await getHitListWithTags(currentShowId, currentRepId);
  } else {
    booths = await getBooths(currentShowId, null, currentListType);
  }
  renderBoothList();
}

async function loadPeopleList() {
  people = await getPeople(currentShowId);
  renderPeopleList();
}

function renderPeopleList() {
  const list = document.getElementById('booth-list');
  document.getElementById('stat-showing').textContent = people.length;
  document.getElementById('stat-tovisit').textContent = '-';
  document.getElementById('stat-followup').textContent = '-';
  document.getElementById('stat-demos').textContent = '-';
  
  if (people.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><p>No people imported</p><button class="btn primary" id="import-people-btn">Import People</button></div>`;
    document.getElementById('import-people-btn')?.addEventListener('click', showAdminModal);
    return;
  }
  
  list.innerHTML = `
    <div class="grid-view">
      <div class="grid-header">
        <span>Name</span>
        <span>Title</span>
        <span>Company</span>
        <span>Domain</span>
      </div>
      ${people.map(p => `
        <div class="grid-row">
          <span class="primary">${p.firstName || ''} ${p.lastName || ''}</span>
          <span>${p.jobTitle || ''}</span>
          <span>${p.companyName || ''}</span>
          <span class="domain">${p.domain || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function getFilteredBooths() {
  let result = [...booths];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(b => 
      (b.companyName || '').toLowerCase().includes(q) ||
      (b.boothNumber || '').toLowerCase().includes(q) ||
      (b.domain || '').toLowerCase().includes(q)
    );
  }

  if (filters.platforms && filters.platforms.length > 0) {
    result = result.filter(b => {
      if (filters.platforms.includes('[No Platform]') && !b.platform) return true;
      return filters.platforms.includes(b.platform);
    });
  }

  if (filters.protections && filters.protections.length > 0) {
    result = result.filter(b => {
      if (filters.protections.includes('[No Protection]') && !b.protection) return true;
      return filters.protections.includes(b.protection);
    });
  }

  if (filters.returns && filters.returns.length > 0) {
    result = result.filter(b => {
      if (filters.returns.includes('[No Returns]') && !b.returns) return true;
      return filters.returns.includes(b.returns);
    });
  }

  if (filters.helpDesks && filters.helpDesks.length > 0) {
    result = result.filter(b => {
      if (filters.helpDesks.includes('[No Help Desk]') && !b.helpDesk) return true;
      return filters.helpDesks.includes(b.helpDesk);
    });
  }

  if (filters.subscriptions && filters.subscriptions.length > 0) {
    result = result.filter(b => {
      if (filters.subscriptions.includes('[No Subscriptions]') && !b.subscriptions) return true;
      return filters.subscriptions.includes(b.subscriptions);
    });
  }

  if (filters.minRevenue > 0) result = result.filter(b => (b.estimatedMonthlySales || 0) >= filters.minRevenue);
  if (filters.statuses && filters.statuses.length > 0) result = result.filter(b => filters.statuses.includes(b.status));
  if (filters.hall !== 'all') {
    result = result.filter(b => {
      const hallInfo = getBoothHall(b.boothNumber);
      return hallInfo && hallInfo.hall === filters.hall;
    });
  }

  // Helper to parse booth number for sorting (handles N100, F7, 3786, etc.)
  const parseBoothForSort = (boothNum) => {
    if (!boothNum) return { prefix: 'ZZZ', num: 99999 };
    const str = boothNum.toString().toUpperCase().trim();
    const match = str.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
    if (match) {
      return { 
        prefix: match[1] || '', 
        num: parseInt(match[2]) || 0,
        suffix: match[3] || ''
      };
    }
    return { prefix: str, num: 0, suffix: '' };
  };

  // First sort by selected criteria
  switch (sortBy) {
    case 'booth': 
      result.sort((a, b) => {
        const pa = parseBoothForSort(a.boothNumber);
        const pb = parseBoothForSort(b.boothNumber);
        // First sort by prefix (F, N, or empty)
        if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
        // Then by number
        if (pa.num !== pb.num) return pa.num - pb.num;
        // Then by suffix
        return (pa.suffix || '').localeCompare(pb.suffix || '');
      });
      break;
    case 'value': result.sort((a, b) => (b.estimatedMonthlySales || 0) - (a.estimatedMonthlySales || 0)); break;
    case 'name': result.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '')); break;
  }
  
  // Then sort by status priority (Come Back first) while maintaining secondary sort
  result.sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status] || 99;
    const priorityB = STATUS_PRIORITY[b.status] || 99;
    return priorityA - priorityB;
  });
  
  return result;
}

function renderBoothList(preserveScroll = false) {
  const filtered = getFilteredBooths();
  const list = document.getElementById('booth-list');
  const config = LIST_CONFIG[currentListType] || {};
  
  // Save scroll position before re-render
  const scrollPos = preserveScroll ? list.scrollTop : 0;
  
  document.getElementById('stat-showing').textContent = filtered.length;
  document.getElementById('stat-tovisit').textContent = booths.filter(b => b.status === STATUS.NOT_VISITED || b.status === STATUS.COME_BACK || !b.status).length;
  document.getElementById('stat-followup').textContent = booths.filter(b => b.status === STATUS.FOLLOW_UP_WARM || b.status === STATUS.FOLLOW_UP_WARM_DIRECT || b.status === STATUS.FOLLOW_UP_WARM_INTRO || b.status === STATUS.FOLLOW_UP_COLD).length;
  document.getElementById('stat-demos').textContent = booths.filter(b => b.status === STATUS.DEMO_BOOKED).length;

  renderActiveFilters();

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No booths found</p>${booths.length === 0 ? '<button class="btn primary" id="import-empty-btn">Import Data</button>' : '<button class="btn secondary" id="clear-filters-empty-btn">Clear filters</button>'}</div>`;
    document.getElementById('import-empty-btn')?.addEventListener('click', showAdminModal);
    document.getElementById('clear-filters-empty-btn')?.addEventListener('click', clearFilters);
    return;
  }
  
  // Restore scroll position after render
  if (preserveScroll) {
    requestAnimationFrame(() => { list.scrollTop = scrollPos; });
  }

  // Grid view for Master, Customer, Working, Opps, People
  if (config.isGrid) {
    const showAppColumn = currentListType === LIST_TYPES.CUSTOMERS;
    list.innerHTML = `
      <div class="grid-view">
        <div class="grid-header">
          <span>Booth</span>
          <span>Company</span>
          <span>Sales</span>
          <span>Platform</span>
          ${config.showRep ? '<span>Owner</span>' : ''}
          ${showAppColumn ? '<span>App</span>' : ''}
        </div>
        ${filtered.map(b => {
          const appBadge = getAppBadge(b.appInstalled, b.productOffering);
          const appToggle = showAppColumn ? `
            <span class="app-toggle" data-booth-id="${b.id}" data-current="${b.appInstalled || ''}">
              ${appBadge || '<button class="app-select-btn">Set App</button>'}
            </span>` : '';
          return `
          <div class="grid-row" data-booth-id="${b.id}">
            <span class="booth-num">${b.boothNumber || '-'}</span>
            <span class="primary">${b.companyName || 'Unknown'}</span>
            <span class="sales">${formatCurrency(b.estimatedMonthlySales)}</span>
            <span>${b.platform || ''}</span>
            ${config.showRep ? `<span class="owner">${getOwnerName(b.ownerId)}</span>` : ''}
            ${appToggle}
          </div>
        `}).join('')}
      </div>
    `;
    
    // Add click handlers for app toggle
    if (showAppColumn) {
      list.querySelectorAll('.app-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const boothId = toggle.dataset.boothId;
          const current = toggle.dataset.current?.toLowerCase() || '';
          showAppSelectModal(boothId, current);
        });
      });
    }
    return;
  }

  // Detail view for Hit List and Inactive Customers
  list.innerHTML = filtered.map(b => {
    const tag = b.tag ? `<span class="item-tag ${b.tag.toLowerCase()}">${b.tag}</span>` : '';
    const claimedTag = b.claimedBy ? `<span class="item-tag claimed">Claimed: ${reps.find(r => r.id === b.claimedBy)?.name || b.claimedBy}</span>` : '';
    const ownerDisplay = config.showRep && b.ownerId ? `<span class="owner-badge">${getOwnerName(b.ownerId)}</span>` : '';
    const hallInfo = getBoothHall(b.boothNumber);
    const igFollowers = formatFollowers(b.instagramFollowers || b.instagram_followers);
    const fbFollowers = formatFollowers(b.facebookFollowers || b.facebook_followers);
    const visits = formatFollowers(b.monthlyVisits || b.monthly_visits);
    const socialDisplay = (igFollowers || fbFollowers) ? 
      `<span class="social-stats">${igFollowers ? `<i class="fab fa-instagram"></i>${igFollowers}` : ''}${fbFollowers ? ` <i class="fab fa-facebook"></i>${fbFollowers}` : ''}</span>` : '';
    const visitsDisplay = visits ? `<span class="visits-stats"><i class="fas fa-eye"></i>${visits}</span>` : '';
    
    return `
    <div class="booth-item ${config.hasDetail ? '' : 'no-click'}" data-booth-id="${b.id}">
      <div class="booth-left">
        <div class="status-dot ${b.status || 'not_visited'}"></div>
        <span class="booth-number">${b.boothNumber || '-'}</span>
        ${hallInfo ? `<span class="hall-badge">${hallInfo.hall}</span>` : ''}
      </div>
      <div class="booth-center">
        <div class="company-row">
          <span class="company-name">${b.companyName || 'Unknown'}</span>
          ${tag}${claimedTag}
        </div>
        <div class="booth-meta">
          <span>${b.platform || 'No platform'}</span>
          ${b.protection ? `<span class="competitor">${b.protection}</span>` : '<span class="no-protection">No protection</span>'}
        </div>
        ${(b.returns || b.helpDesk || b.subscriptions || b.competitorInstalls || b.competitorUninstalls) ? `
        <div class="booth-tech-badges">
          ${b.returns ? `<span class="returns-item"><i class="fas fa-undo-alt"></i> ${b.returns}</span>` : ''}
          ${b.helpDesk ? `<span class="helpdesk-item"><i class="fas fa-headset"></i> ${b.helpDesk}</span>` : ''}
          ${b.subscriptions ? `<span class="subscriptions-item"><i class="fas fa-sync-alt"></i> ${b.subscriptions}</span>` : ''}
          ${(b.competitorInstalls || b.competitorUninstalls) ? `<span class="tech-item"><i class="fas fa-chart-bar"></i>${b.competitorInstalls ? ` In: ${b.competitorInstalls}` : ''}${b.competitorUninstalls ? ` Out: ${b.competitorUninstalls}` : ''}</span>` : ''}
        </div>` : ''}
        <div class="booth-social-row">
          ${socialDisplay}
          ${visitsDisplay}
          ${ownerDisplay}
        </div>
      </div>
      <div class="booth-right">
        <span class="sales-value">${formatCurrency(b.estimatedMonthlySales)}</span>
        ${config.hasDetail ? '<i class="fas fa-chevron-right"></i>' : ''}
        ${config.canClaim && !b.claimedBy ? `<button class="claim-btn" data-booth-id="${b.id}">Claim</button>` : ''}
      </div>
    </div>
  `}).join('');
  
  // Attach click handlers
  if (config.hasDetail) {
    list.querySelectorAll('.booth-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('claim-btn')) {
          showDetailView(item.dataset.boothId);
        }
      });
    });
  }
  
  // Attach claim handlers
  if (config.canClaim) {
    list.querySelectorAll('.claim-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleClaimLead(btn.dataset.boothId);
      });
    });
  }
}

function formatCurrency(val) {
  if (!val || val === 0) return '$0';
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}K`;
  return `$${val}`;
}

function renderActiveFilters() {
  const container = document.getElementById('active-filters');
  const badge = document.getElementById('filter-badge');
  const btn = document.getElementById('filter-btn');
  
  let count = 0;
  let chips = [];

  if (filters.platforms && filters.platforms.length > 0) { count++; chips.push({ key: 'platforms', label: filters.platforms.join(', ') }); }
  if (filters.protections && filters.protections.length > 0) { count++; chips.push({ key: 'protections', label: `Protection: ${filters.protections.join(', ')}` }); }
  if (filters.returns && filters.returns.length > 0) { count++; chips.push({ key: 'returns', label: `Returns: ${filters.returns.join(', ')}` }); }
  if (filters.helpDesks && filters.helpDesks.length > 0) { count++; chips.push({ key: 'helpDesks', label: `HD: ${filters.helpDesks.join(', ')}` }); }
  if (filters.subscriptions && filters.subscriptions.length > 0) { count++; chips.push({ key: 'subscriptions', label: `Subs: ${filters.subscriptions.join(', ')}` }); }
  if (filters.minRevenue > 0) { count++; chips.push({ key: 'minRevenue', label: `≥ ${formatCurrency(filters.minRevenue)}` }); }
  if (filters.statuses && filters.statuses.length > 0) { count++; chips.push({ key: 'statuses', label: filters.statuses.length === 1 ? STATUS_LABELS[filters.statuses[0]] : `${filters.statuses.length} statuses` }); }
  if (filters.hall !== 'all') { count++; chips.push({ key: 'hall', label: filters.hall }); }

  if (count > 0) {
    container.innerHTML = chips.map(c => `<button class="filter-chip" data-filter="${c.key}">${c.label} <i class="fas fa-times"></i></button>`).join('') +
      '<button class="clear-all-btn" id="clear-all-filters-btn">Clear All</button>';
    container.classList.remove('hidden');
    badge.textContent = count;
    badge.classList.remove('hidden');
    btn.classList.add('active');
    
    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.filter;
        if (key === 'minRevenue') filters[key] = 0;
        else if (['platforms', 'statuses', 'protections', 'returns', 'helpDesks', 'subscriptions'].includes(key)) filters[key] = [];
        else filters[key] = 'all';
        saveFilters();
        renderBoothList();
      });
    });
    document.getElementById('clear-all-filters-btn')?.addEventListener('click', clearFilters);
  } else {
    container.classList.add('hidden');
    badge.classList.add('hidden');
    btn.classList.remove('active');
  }
}

function showAppSelectModal(boothId, currentApp) {
  const modal = document.createElement('div');
  modal.className = 'modal app-select-modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 300px;">
      <div class="modal-header">
        <h2>Select App</h2>
        <button class="icon-btn close-modal-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="app-select-options">
        <button class="app-option-btn ${currentApp === 'ecocart' ? 'selected' : ''}" data-app="ecocart">
          <span class="app-badge ecocart">EcoCart</span>
        </button>
        <button class="app-option-btn ${currentApp === 'shipinsure' ? 'selected' : ''}" data-app="shipinsure">
          <span class="app-badge shipinsure">ShipInsure</span>
        </button>
        <button class="app-option-btn ${!currentApp ? 'selected' : ''}" data-app="">
          None
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelectorAll('.app-option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const app = btn.dataset.app;
      const booth = booths.find(b => b.id === boothId);
      if (booth) {
        booth.appInstalled = app;
        await saveBooth(booth);
        await loadBoothList();
      }
      modal.remove();
    });
  });
}

async function handleClaimLead(boothId) {
  // Show rep selector
  const repNames = reps.map(r => r.name).join(', ');
  const repName = prompt(`Claim this lead for which rep?\n(${repNames})`);
  if (!repName) return;
  
  const rep = reps.find(r => r.name.toLowerCase() === repName.toLowerCase());
  if (!rep) {
    alert('Rep not found. Please enter: ' + repNames);
    return;
  }
  
  await claimLead(boothId, rep.id, currentShowId);
  await loadBoothList();
  alert(`Lead claimed for ${rep.name} and added to their Hit List`);
}

function clearSearch() {
  searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search').classList.add('hidden');
  renderBoothList();
}

// ============ DETAIL VIEW ============

async function showDetailView(id) {
  // Save list scroll position before navigating
  const list = document.getElementById('booth-list');
  if (list) listScrollPosition = list.scrollTop;
  
  currentBoothId = id;
  const booth = booths.find(b => b.id === id);
  if (!booth) return;

  // Get people for this company domain
  const companyPeople = booth.domain ? await getPeopleByDomain(currentShowId, booth.domain) : [];
  
  // Get hall info and social data
  const hallInfo = getBoothHall(booth.boothNumber);
  const igFollowers = formatFollowers(booth.instagramFollowers || booth.instagram_followers);
  const fbFollowers = formatFollowers(booth.facebookFollowers || booth.facebook_followers);
  const visits = formatFollowers(booth.monthlyVisits || booth.monthly_visits);

  document.getElementById('detail-company').textContent = booth.companyName || 'Unknown';
  
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-row">
        <span class="booth-badge">Booth ${booth.boothNumber || '-'}</span>
        ${hallInfo ? `<span class="hall-badge-detail">${hallInfo.hall} • ${hallInfo.category}</span>` : ''}
        <span class="detail-sales">${formatCurrency(booth.estimatedMonthlySales)}/mo</span>
      </div>
      <div class="detail-domain">${booth.domain || ''}</div>
      <div class="detail-meta">
        ${booth.platform || 'No platform'}
        ${booth.protection ? `<span class="competitor"> • ${booth.protection}</span>` : '<span class="no-protection"> • No protection</span>'}
        ${booth.returns ? `<span class="returns-item"> • ${booth.returns}</span>` : ''}
        ${booth.helpDesk ? `<span class="helpdesk-item"> • ${booth.helpDesk}</span>` : ''}
        ${booth.subscriptions ? `<span class="subscriptions-item"> • ${booth.subscriptions}</span>` : ''}
      </div>
      ${(igFollowers || fbFollowers || visits) ? `
      <div class="detail-social">
        ${igFollowers ? `<span class="social-item"><i class="fab fa-instagram"></i> ${igFollowers}</span>` : ''}
        ${fbFollowers ? `<span class="social-item"><i class="fab fa-facebook"></i> ${fbFollowers}</span>` : ''}
        ${visits ? `<span class="social-item"><i class="fas fa-eye"></i> ${visits} visits/mo</span>` : ''}
      </div>
      ` : ''}
      ${(booth.competitorInstalls || booth.competitorUninstalls || booth.protection || booth.techInstalls) ? `
      <div class="detail-tech">
        ${booth.competitorInstalls ? `<span class="tech-item"><i class="fas fa-arrow-circle-down"></i> Installs: ${booth.competitorInstalls}</span>` : ''}
        ${booth.competitorUninstalls ? `<span class="tech-item uninstall"><i class="fas fa-trash-alt"></i> Uninstalls: ${booth.competitorUninstalls}</span>` : ''}
        ${booth.protection ? `<span class="competitor-inline"><i class="fas fa-shield-alt"></i> ${booth.protection}</span>` : ''}
        ${booth.techInstalls ? `<span class="tech-item"><i class="fas fa-plug"></i> ${booth.techInstalls}</span>` : ''}
      </div>
      ` : ''}
      ${booth.tag ? `<span class="detail-tag ${booth.tag.toLowerCase()}">${booth.tag}</span>` : ''}
      <div class="detail-links">
        ${booth.domain ? `<a href="https://${booth.domain}" target="_blank" class="detail-link"><i class="fas fa-globe"></i> Website</a>` : ''}
        ${booth.hubspotUrl || booth.hubspot_url ? `<a href="${booth.hubspotUrl || booth.hubspot_url}" target="_blank" class="detail-link hubspot"><i class="fab fa-hubspot"></i> HubSpot</a>` : ''}
      </div>
    </div>

    ${companyPeople.length > 0 ? `
    <div class="section">
      <div class="section-title">People at ${booth.companyName}</div>
      <div class="people-list">
        ${companyPeople.map(p => `
          <div class="person-card">
            <div class="person-name">${p.firstName || ''} ${p.lastName || ''}</div>
            <div class="person-title">${p.jobTitle || ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Status</div>
      <div class="status-buttons">
        ${Object.entries(STATUS).map(([key, val]) => `
          <button class="status-btn ${val} ${booth.status === val ? 'active' : ''}" data-status="${val}">
            <i class="fas fa-${getStatusIcon(val)}"></i>
            ${STATUS_LABELS[val]}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Tech</div>
      <div class="form-group">
        <label>Protection</label>
        <select class="input" id="protection-select">
          <option value="">None</option>
          ${PROTECTION_OPTIONS.map(o => `<option value="${o}" ${booth.protection === o ? 'selected' : ''}>${o}</option>`).join('')}
          <option value="__other__" ${booth.protection && !PROTECTION_OPTIONS.includes(booth.protection) ? 'selected' : ''}>Other...</option>
        </select>
        <input type="text" class="input" id="protection-custom" placeholder="Enter provider..."
          value="${booth.protection && !PROTECTION_OPTIONS.includes(booth.protection) ? booth.protection : ''}"
          style="margin-top: 8px;${booth.protection && !PROTECTION_OPTIONS.includes(booth.protection) ? '' : ' display:none'}">
      </div>
      <div class="form-group" style="margin-top: 12px;">
        <label>Returns</label>
        <select class="input" id="returns-select">
          <option value="">None</option>
          ${RETURNS_OPTIONS.map(o => `<option value="${o}" ${booth.returns === o ? 'selected' : ''}>${o}</option>`).join('')}
          <option value="__other__" ${booth.returns && !RETURNS_OPTIONS.includes(booth.returns) ? 'selected' : ''}>Other...</option>
        </select>
        <input type="text" class="input" id="returns-custom" placeholder="Enter provider..."
          value="${booth.returns && !RETURNS_OPTIONS.includes(booth.returns) ? booth.returns : ''}"
          style="margin-top: 8px;${booth.returns && !RETURNS_OPTIONS.includes(booth.returns) ? '' : ' display:none'}">
      </div>
      <div class="form-group" style="margin-top: 12px;">
        <label>Help Desk</label>
        <select class="input" id="helpdesk-select">
          <option value="">None</option>
          ${HELPDESK_OPTIONS.map(o => `<option value="${o}" ${booth.helpDesk === o ? 'selected' : ''}>${o}</option>`).join('')}
          <option value="__other__" ${booth.helpDesk && !HELPDESK_OPTIONS.includes(booth.helpDesk) ? 'selected' : ''}>Other...</option>
        </select>
        <input type="text" class="input" id="helpdesk-custom" placeholder="Enter provider..."
          value="${booth.helpDesk && !HELPDESK_OPTIONS.includes(booth.helpDesk) ? booth.helpDesk : ''}"
          style="margin-top: 8px;${booth.helpDesk && !HELPDESK_OPTIONS.includes(booth.helpDesk) ? '' : ' display:none'}">
      </div>
      <div class="form-group" style="margin-top: 12px;">
        <label>Subscriptions</label>
        <select class="input" id="subscriptions-select">
          <option value="">None</option>
          ${SUBSCRIPTIONS_OPTIONS.map(o => `<option value="${o}" ${booth.subscriptions === o ? 'selected' : ''}>${o}</option>`).join('')}
          <option value="__other__" ${booth.subscriptions && !SUBSCRIPTIONS_OPTIONS.includes(booth.subscriptions) ? 'selected' : ''}>Other...</option>
        </select>
        <input type="text" class="input" id="subscriptions-custom" placeholder="Enter provider..."
          value="${booth.subscriptions && !SUBSCRIPTIONS_OPTIONS.includes(booth.subscriptions) ? booth.subscriptions : ''}"
          style="margin-top: 8px;${booth.subscriptions && !SUBSCRIPTIONS_OPTIONS.includes(booth.subscriptions) ? '' : ' display:none'}">
      </div>
    </div>

    <div class="section">
      <div class="section-title" id="contact-section-title">
        Contact Info
        ${booth.contactName || booth.contactEmail ? '<span class="ocr-badge"><i class="fas fa-magic"></i> OCR</span>' : ''}
      </div>
      <div class="crm-bot-row" id="crm-bot-row">
        <span class="crm-bot-avatar"><img src="TST_crmbot.png" class="crm-bot-img" alt="CRM Bot"></span>
        <span class="crm-bot-badge loading" id="crm-bot-badge"><i class="fas fa-spinner fa-spin"></i></span>
      </div>
      <input type="text" class="input" id="contact-name" placeholder="Contact name..." value="${booth.contactName || ''}">
      <input type="text" class="input" id="contact-title" placeholder="Title (e.g., Director of E-commerce)..." value="${booth.contactTitle || ''}" style="margin-top: 8px;">
      <input type="email" class="input" id="contact-email" placeholder="Email..." value="${booth.contactEmail || ''}" style="margin-top: 8px;">
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <input type="tel" class="input" id="contact-phone" placeholder="Phone..." value="${booth.contactPhone || ''}" style="flex: 2;">
        <input type="text" class="input" id="contact-ext" placeholder="Ext" value="${booth.contactExt || ''}" style="flex: 1;">
      </div>
      ${booth.contactOther ? `<textarea class="input" id="contact-other" readonly style="margin-top: 8px; background: var(--bg-secondary); font-size: 12px;" rows="2">${booth.contactOther}</textarea>` : ''}
      <div class="picker-row">
        <button class="picker-btn" id="orders-picker-btn"><label>Orders/mo</label><span id="orders-value">${booth.ordersPerMonth || 'N/A'}</span><i class="fas fa-chevron-down"></i></button>
        <button class="picker-btn" id="aov-picker-btn"><label>AOV</label><span id="aov-value">${booth.aov || 'N/A'}</span><i class="fas fa-chevron-down"></i></button>
      </div>
      <div id="orders-picker" class="options-list hidden">${ORDER_OPTIONS.map(o => `<div class="option-item ${booth.ordersPerMonth === o ? 'active' : ''}" data-field="ordersPerMonth" data-value="${o}">${o}</div>`).join('')}</div>
      <div id="aov-picker" class="options-list hidden">${AOV_OPTIONS.map(o => `<div class="option-item ${booth.aov === o ? 'active' : ''}" data-field="aov" data-value="${o}">${o}</div>`).join('')}</div>
    </div>

    <div class="section">
      <div class="section-title">Notes</div>
      <textarea class="input" id="notes-input" placeholder="Tap mic to dictate...">${booth.notes || ''}</textarea>
    </div>

    <div class="section">
      <div class="section-title">Business Card</div>
      <div id="card-container">
        ${booth.businessCardData 
          ? `<div class="card-preview"><img src="${booth.businessCardData}" alt="Card"><div class="card-actions"><button class="card-action" id="retake-card-btn"><i class="fas fa-camera"></i> Retake</button><button class="card-action scan" id="scan-card-btn"><i class="fas fa-magic"></i> Scan OCR</button><button class="card-action danger" id="remove-card-btn"><i class="fas fa-trash"></i> Remove</button></div></div>`
          : `<button class="capture-card-btn" id="capture-card-btn"><i class="fas fa-camera"></i> Capture Business Card</button>`}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Submit to HubSpot</div>
      <div class="submit-row">
        <button class="submit-btn webhook" id="submit-followup-btn"><i class="fas fa-paper-plane"></i> Submit Follow Up</button>
        <button class="submit-btn webhook demo" id="submit-demo-btn"><i class="fas fa-paper-plane"></i> Submit Demo</button>
      </div>
      <button class="submit-btn webhook hubspot-note" id="submit-note-btn" style="margin-top: 8px; width: 100%;"><i class="fab fa-hubspot"></i> Create HubSpot Note</button>
    </div>

    <div class="section">
      <div class="section-title">Outreach</div>
      <button class="btn secondary full" id="draft-email-btn"><i class="fas fa-magic"></i> Draft Follow-Up Email</button>
    </div>

    ${getAlignedSection()}
    
    ${getCalendarSection()}
    
    ${getFilesSection(booth)}
  `;

  // Attach event listeners
  content.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.status));
  });
  
  document.getElementById('contact-name').addEventListener('change', (e) => updateBoothField('contactName', e.target.value));
  document.getElementById('contact-title')?.addEventListener('change', (e) => updateBoothField('contactTitle', e.target.value));
  document.getElementById('contact-email')?.addEventListener('change', (e) => updateBoothField('contactEmail', e.target.value));
  document.getElementById('contact-phone')?.addEventListener('change', (e) => updateBoothField('contactPhone', e.target.value));
  document.getElementById('contact-ext')?.addEventListener('change', (e) => updateBoothField('contactExt', e.target.value));
  document.getElementById('notes-input').addEventListener('change', (e) => updateBoothField('notes', e.target.value));

  // Protection & Returns selects
  const protectionSelect = document.getElementById('protection-select');
  const protectionCustom = document.getElementById('protection-custom');
  protectionSelect?.addEventListener('change', async () => {
    if (protectionSelect.value === '__other__') {
      protectionCustom.style.display = '';
      protectionCustom.focus();
    } else {
      protectionCustom.style.display = 'none';
      booth.protection = protectionSelect.value;
      await saveBooth(booth);
      showDetailView(currentBoothId);
      renderBoothList();
    }
  });
  protectionCustom?.addEventListener('change', async () => {
    booth.protection = protectionCustom.value;
    await saveBooth(booth);
    showDetailView(currentBoothId);
    renderBoothList();
  });

  const returnsSelect = document.getElementById('returns-select');
  const returnsCustom = document.getElementById('returns-custom');
  returnsSelect?.addEventListener('change', async () => {
    if (returnsSelect.value === '__other__') {
      returnsCustom.style.display = '';
      returnsCustom.focus();
    } else {
      returnsCustom.style.display = 'none';
      booth.returns = returnsSelect.value;
      await saveBooth(booth);
      showDetailView(currentBoothId);
      renderBoothList();
    }
  });
  returnsCustom?.addEventListener('change', async () => {
    booth.returns = returnsCustom.value;
    await saveBooth(booth);
    showDetailView(currentBoothId);
    renderBoothList();
  });

  const helpdeskSelect = document.getElementById('helpdesk-select');
  const helpdeskCustom = document.getElementById('helpdesk-custom');
  helpdeskSelect?.addEventListener('change', async () => {
    if (helpdeskSelect.value === '__other__') {
      helpdeskCustom.style.display = '';
      helpdeskCustom.focus();
    } else {
      helpdeskCustom.style.display = 'none';
      booth.helpDesk = helpdeskSelect.value;
      await saveBooth(booth);
      showDetailView(currentBoothId);
      renderBoothList();
    }
  });
  helpdeskCustom?.addEventListener('change', async () => {
    booth.helpDesk = helpdeskCustom.value;
    await saveBooth(booth);
    showDetailView(currentBoothId);
    renderBoothList();
  });

  const subscriptionsSelect = document.getElementById('subscriptions-select');
  const subscriptionsCustom = document.getElementById('subscriptions-custom');
  subscriptionsSelect?.addEventListener('change', async () => {
    if (subscriptionsSelect.value === '__other__') {
      subscriptionsCustom.style.display = '';
      subscriptionsCustom.focus();
    } else {
      subscriptionsCustom.style.display = 'none';
      booth.subscriptions = subscriptionsSelect.value;
      await saveBooth(booth);
      showDetailView(currentBoothId);
      renderBoothList();
    }
  });
  subscriptionsCustom?.addEventListener('change', async () => {
    booth.subscriptions = subscriptionsCustom.value;
    await saveBooth(booth);
    showDetailView(currentBoothId);
    renderBoothList();
  });
  
  document.getElementById('orders-picker-btn').addEventListener('click', () => togglePicker('orders'));
  document.getElementById('aov-picker-btn').addEventListener('click', () => togglePicker('aov'));
  
  content.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', () => selectOption(item.dataset.field, item.dataset.value));
  });
  
  document.getElementById('capture-card-btn')?.addEventListener('click', openCamera);
  document.getElementById('retake-card-btn')?.addEventListener('click', openCamera);
  document.getElementById('scan-card-btn')?.addEventListener('click', scanBusinessCard);
  document.getElementById('remove-card-btn')?.addEventListener('click', removeCard);
  
  document.getElementById('submit-followup-btn')?.addEventListener('click', () => showSubmitModal('followup'));
  document.getElementById('submit-demo-btn')?.addEventListener('click', () => showSubmitModal('demo'));
  document.getElementById('submit-note-btn')?.addEventListener('click', () => showSubmitModal('ocr_note'));
  document.getElementById('draft-email-btn')?.addEventListener('click', () => draftEmail(currentBoothId));
  checkCrmBotStatus(booth);
  
  // File upload listeners
  document.getElementById('upload-files-btn')?.addEventListener('click', () => {
    document.getElementById('file-upload-input').click();
  });
  document.getElementById('file-upload-input')?.addEventListener('change', handleFileUpload);
  content.querySelectorAll('.file-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAttachment(parseInt(btn.dataset.idx));
    });
  });
  content.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
      const booth = booths.find(b => b.id === currentBoothId);
      const attachment = booth?.attachments?.[parseInt(item.dataset.idx)];
      if (attachment?.url) window.open(attachment.url, '_blank');
    });
  });

  hideAllViews();
  document.getElementById('detail-view').classList.add('active');
}

const HS_SYNC_STATUSES = new Set([
  STATUS.FOLLOW_UP_WARM,
  STATUS.FOLLOW_UP_WARM_DIRECT,
  STATUS.FOLLOW_UP_WARM_INTRO,
  STATUS.FOLLOW_UP_COLD,
  STATUS.DEMO_BOOKED,
]);

async function setStatus(status, skipHsSync = false) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) {
    booth.status = status;
    await saveBooth(booth);
    showDetailView(currentBoothId);
    renderBoothList();

    // Silent background contact sync — skipped when called from submit modal
    if (!skipHsSync && HS_SYNC_STATUSES.has(status)) {
      const show = shows.find(s => s.id === currentShowId);
      syncToHubSpot(booth, show, status === STATUS.DEMO_BOOKED);
    }
  }
}

async function syncToHubSpot(booth, show, isDemoBooked) {
  try {
    const res = await fetch(HUBSPOT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        action: 'sync',
        booth,
        showName: show?.name || '',
        isDemoBooked,
      }),
    });
    const data = await res.json();
    if (data.error) { console.warn('HubSpot sync error:', data.error); return; }
    // Store HubSpot IDs back on booth to prevent duplicate deal creation
    const b = booths.find(b => b.id === booth.id);
    if (b) {
      if (data.contactId && !b.recordId)  { b.recordId  = data.contactId; }
      if (data.dealId    && !b.hsDealId)  { b.hsDealId  = data.dealId;    }
      if (data.contactId || data.dealId)  { await saveBooth(b); }
    }
  } catch (e) {
    console.warn('HubSpot sync failed:', e);
  }
}

async function updateBoothField(field, value) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) {
    booth[field] = value;
    await saveBooth(booth);
  }
}

function togglePicker(type) {
  document.getElementById(`${type}-picker`).classList.toggle('hidden');
  document.getElementById(type === 'orders' ? 'aov-picker' : 'orders-picker').classList.add('hidden');
}

async function selectOption(field, value) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) {
    booth[field] = value;
    await saveBooth(booth);
    showDetailView(currentBoothId);
  }
}

function copyForFollowUp() {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  const text = [booth.companyName, booth.ordersPerMonth || 'N/A', booth.aov || 'N/A', booth.notes].filter(Boolean).join('\n');
  navigator.clipboard.writeText(text);
  if (booth.status === STATUS.NOT_VISITED || booth.status === STATUS.COME_BACK) setStatus(STATUS.FOLLOW_UP_WARM_DIRECT);
  alert('Copied for Follow Up workflow');
}

function copyForDemo() {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  const text = [booth.companyName, booth.ordersPerMonth || 'N/A', booth.aov || 'N/A', booth.notes].filter(Boolean).join('\n');
  navigator.clipboard.writeText(text);
  setStatus(STATUS.DEMO_BOOKED);
  alert('Copied for Demo workflow');
}

// Webhook URLs
const WEBHOOK_URLS = {
  demo: 'https://hooks.zapier.com/hooks/catch/17560963/u0aled7/',
  followup: 'https://hooks.zapier.com/hooks/catch/17560963/u0lktl4/',
  ocr_note: 'https://hooks.zapier.com/hooks/catch/17560963/upbjwin/'
};

// OCR Edge Function URL
const OCR_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hyper-processor`;
const DRAFT_EMAIL_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/draft-email`;
const HUBSPOT_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/hubspot`;
let dashboardBooths = [];

// OCR Business Card using Supabase Edge Function
async function scanBusinessCard() {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth || !booth.businessCardData) {
    alert('No business card image to scan');
    return;
  }
  
  const btn = document.getElementById('scan-card-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Scanning...';
  btn.disabled = true;
  
  try {
    // Extract base64 data from data URL
    const base64Data = booth.businessCardData.split(',')[1];
    
    const response = await fetch(OCR_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ image: base64Data })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} - ${errText}`);
    }
    
    const extracted = await response.json();
    
    if (extracted.error) {
      throw new Error(extracted.error);
    }
    
    // Update fields in memory and DOM immediately
    const setField = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    if (extracted.name) { booth.contactName = extracted.name; setField('contact-name', extracted.name); }
    if (extracted.email) { booth.contactEmail = extracted.email; setField('contact-email', extracted.email); }
    if (extracted.phone) { booth.contactPhone = extracted.phone; setField('contact-phone', extracted.phone); }
    if (extracted.title) { booth.contactTitle = extracted.title; setField('contact-title', extracted.title); }
    if (extracted.ext) { booth.contactExt = extracted.ext; setField('contact-ext', extracted.ext); }
    if (extracted.other) {
      booth.contactOther = extracted.other;
      let el = document.getElementById('contact-other');
      if (!el) {
        el = document.createElement('textarea');
        el.className = 'input'; el.id = 'contact-other'; el.readOnly = true; el.rows = 2;
        el.style.cssText = 'margin-top: 8px; background: var(--bg-secondary); font-size: 12px;';
        document.getElementById('contact-ext')?.closest('div')?.insertAdjacentElement('afterend', el);
      }
      el.value = extracted.other;
    }
    if (extracted.name || extracted.email) {
      const title = document.getElementById('contact-section-title');
      if (title && !title.querySelector('.ocr-badge')) {
        title.insertAdjacentHTML('beforeend', '<span class="ocr-badge"><i class="fas fa-magic"></i> OCR</span>');
      }
    }
    
    await saveBooth(booth);
    
    // Show success with extracted info
    const summary = [
      extracted.name && `Name: ${extracted.name}`,
      extracted.email && `Email: ${extracted.email}`,
      extracted.phone && `Phone: ${extracted.phone}${extracted.ext ? ' x' + extracted.ext : ''}`,
      extracted.title && `Title: ${extracted.title}`
    ].filter(Boolean).join('\n');
    
    alert(`Card scanned successfully!\n\n${summary || 'No contact info found'}`);
    
  } catch (err) {
    console.error('OCR error:', err);
    alert('Error scanning card: ' + err.message);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Get default task date (5 business days from now)
function getDefaultTaskDate() {
  const date = new Date();
  let businessDays = 5;
  while (businessDays > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) businessDays--;
  }
  return date.toISOString().split('T')[0];
}

function showSubmitModal(type) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  
  const show = shows.find(s => s.id === currentShowId);
  const isDemo = type === 'demo';
  const isNote = type === 'ocr_note';
  
  // Determine modal title and button text
  let modalTitle = 'Submit Follow Up';
  let buttonText = 'Submit Follow Up';
  if (isDemo) {
    modalTitle = 'Submit Demo Booked';
    buttonText = 'Submit Demo';
  } else if (isNote) {
    modalTitle = 'Create HubSpot Note';
    buttonText = 'Create Note';
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal submit-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>${modalTitle}</h2>
        <button class="icon-btn close-modal-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <div class="submit-form">
          <!-- Rep & Submit at top -->
          <div class="form-group">
            <label>Your Name</label>
            <select class="input" id="submit-rep">
              ${reps.filter(r => {
                const showReps = show?.reps || reps.map(rep => rep.id);
                return showReps.includes(r.id);
              }).map(r => `<option value="${r.id}" ${r.id === currentRepId ? 'selected' : ''}>${r.name}</option>`).join('')}
            </select>
          </div>
          <button class="btn primary full" id="submit-webhook-btn" style="margin-top: 8px; margin-bottom: 16px;">
            <i class="${isNote ? 'fab fa-hubspot' : 'fas fa-paper-plane'}"></i> ${buttonText}
          </button>
          
          <hr style="border: none; border-top: 1px solid var(--border); margin: 8px 0 16px;">
          
          <!-- Date field (not shown for ocr_note) -->
          ${isDemo ? `
          <div class="form-group">
            <label>Demo Date</label>
            <input type="datetime-local" class="input" id="submit-demo-date">
          </div>
          ` : isNote ? '' : `
          <div class="form-group">
            <label>Follow Up Task Date</label>
            <input type="date" class="input" id="submit-task-date" value="${getDefaultTaskDate()}">
          </div>
          <div class="form-group">
            <label>Follow Up Type</label>
            <div class="followup-type-btns">
              <button type="button" class="followup-type-btn active" data-type="direct"><i class="fas fa-fire"></i> Direct</button>
              <button type="button" class="followup-type-btn" data-type="intro"><i class="fas fa-random"></i> Intro</button>
              <button type="button" class="followup-type-btn" data-type="cold"><i class="fas fa-snowflake"></i> Cold</button>
            </div>
          </div>
          `}
          
          <!-- Orders & AOV first -->
          <div class="form-group">
            <label>Avg Monthly Store Orders</label>
            <input type="text" class="input" id="submit-orders" value="${booth.ordersPerMonth || ''}" placeholder="e.g., 500 - 1,000">
          </div>
          <div class="form-group">
            <label>AOV</label>
            <input type="text" class="input" id="submit-aov" value="${booth.aov || ''}" placeholder="e.g., $50 - $100">
          </div>
          
          <hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;">
          <div class="section-label" style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Info ${booth.contactName || booth.contactEmail ? '<span style="color: var(--green);"><i class="fas fa-magic"></i> OCR</span>' : ''}</div>
          
          <!-- Contact Info section -->
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" class="input" id="submit-company" value="${booth.companyName || ''}" readonly>
          </div>
          <div class="form-group">
            <label>Contact Name</label>
            <input type="text" class="input" id="submit-contact-name" value="${booth.contactName || ''}" placeholder="e.g., John Smith">
          </div>
          <div class="form-group">
            <label>Title</label>
            <input type="text" class="input" id="submit-contact-title" value="${booth.contactTitle || ''}" placeholder="e.g., Director of E-commerce">
          </div>
          <div class="form-group">
            <label>Contact Email</label>
            <input type="email" class="input" id="submit-contact-email" value="${booth.contactEmail || ''}" placeholder="e.g., john@company.com">
          </div>
          <div class="form-row" style="display: flex; gap: 12px;">
            <div class="form-group" style="flex: 2;">
              <label>Contact Phone</label>
              <input type="tel" class="input" id="submit-contact-phone" value="${booth.contactPhone || ''}" placeholder="e.g., 555-123-4567">
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Ext</label>
              <input type="text" class="input" id="submit-contact-ext" value="${booth.contactExt || ''}" placeholder="e.g., 123">
            </div>
          </div>
          ${booth.contactOther ? `
          <div class="form-group">
            <label>Other (from OCR)</label>
            <textarea class="input" id="submit-contact-other" rows="2" readonly style="background: var(--bg); font-size: 12px;">${booth.contactOther || ''}</textarea>
          </div>
          ` : ''}
          
          <hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;">
          
          <div class="form-group">
            <label>Notes</label>
            <textarea class="input" id="submit-notes" rows="3" placeholder="Add any notes...">${booth.notes || ''}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  // Follow up type toggle (direct/intro/cold)
  let followUpType = 'direct';
  modal.querySelectorAll('.followup-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.followup-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      followUpType = btn.dataset.type;
    });
  });
  
  modal.querySelector('#submit-webhook-btn').addEventListener('click', async () => {
    const repId = modal.querySelector('#submit-rep').value;
    const repName = getRepName(repId);
    const hubspotId = getHubSpotOwnerId(repId);
    
    const payload = {
      companyName: modal.querySelector('#submit-company').value,
      boothNumber: booth.boothNumber || '',
      domain: booth.domain || '',
      contactName: modal.querySelector('#submit-contact-name').value,
      contactTitle: modal.querySelector('#submit-contact-title')?.value || '',
      contactEmail: modal.querySelector('#submit-contact-email').value,
      contactPhone: modal.querySelector('#submit-contact-phone').value,
      contactExt: modal.querySelector('#submit-contact-ext')?.value || '',
      ordersPerMonth: modal.querySelector('#submit-orders').value,
      aov: modal.querySelector('#submit-aov').value,
      notes: modal.querySelector('#submit-notes').value,
      repName: repName,
      repHubSpotId: hubspotId,
      showName: show?.name || '',
      campaign: `${show?.name || 'Trade Show'} - 2026`,
      hasBusinessCard: !!booth.businessCardData,
      businessCardUrl: booth.businessCardUrl || '',
      recordId: booth.recordId || '',
      hubspotCompanyUrl: booth.hubspotUrl || booth.hubspot_url || '',
      type: type,
      boothId: booth.id,
      showId: currentShowId,
      repId: currentRepId,
    };
    
    if (isDemo) {
      const demoDateInput = modal.querySelector('#submit-demo-date').value;
      payload.demoDate = demoDateInput || '';
    } else if (!isNote) {
      // Follow up - add task date with 9:00 AM MST (not for ocr_note)
      const taskDateInput = modal.querySelector('#submit-task-date')?.value;
      if (taskDateInput) {
        payload.taskDate = `${taskDateInput}T09:00:00-07:00`; // 9:00 AM MST
      }
    }
    
    const webhookUrl = WEBHOOK_URLS[type];
    if (!webhookUrl) {
      alert('Webhook URL not configured for ' + type);
      return;
    }
    
    try {
      modal.querySelector('#submit-webhook-btn').disabled = true;
      modal.querySelector('#submit-webhook-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

      // ocr_note still goes to Zapier (note-only flow, no HubSpot contact/deal needed)
      if (isNote) {
        const webhookUrl = WEBHOOK_URLS.ocr_note;
        if (webhookUrl) {
          const iframe = document.createElement('iframe');
          iframe.name = 'zapier-note-frame';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
          const form = document.createElement('form');
          form.method = 'POST'; form.action = webhookUrl; form.target = 'zapier-note-frame';
          Object.entries(payload).forEach(([k, v]) => {
            const inp = document.createElement('input'); inp.type = 'hidden'; inp.name = k; inp.value = v;
            form.appendChild(inp);
          });
          document.body.appendChild(form); form.submit();
          setTimeout(() => { form.remove(); iframe.remove(); }, 2000);
        }
      } else {
        // Demo + Follow Up → Supabase edge function (HubSpot + Slack)
        const hsRes = await fetch(HUBSPOT_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            action: 'submit',
            payload: { ...payload, hsDealId: booth.hsDealId || null },
            isDemoBooked: isDemo,
            showName: show?.name || '',
          }),
        });
        const hsData = await hsRes.json();
        // Store HubSpot IDs on booth to prevent duplicate deal creation
        if (hsData.contactId && !booth.recordId) booth.recordId = hsData.contactId;
        if (hsData.dealId    && !booth.hsDealId)  booth.hsDealId = hsData.dealId;
      }

      // Update booth status — skipHsSync=true since submit already handled it
      if (isDemo) {
        await setStatus(STATUS.DEMO_BOOKED, true);
      } else if (!isNote) {
        const newStatus = followUpType === 'cold' ? STATUS.FOLLOW_UP_COLD
          : followUpType === 'intro' ? STATUS.FOLLOW_UP_WARM_INTRO
          : STATUS.FOLLOW_UP_WARM_DIRECT;
        await setStatus(newStatus, true);
      }
      
      // Update booth with latest values
      booth.ordersPerMonth = payload.ordersPerMonth;
      booth.aov = payload.aov;
      booth.notes = payload.notes;
      await saveBooth(booth);
      
      modal.remove();
      const successMsg = isDemo ? 'Demo' : isNote ? 'HubSpot Note' : 'Follow Up';
      alert(`${successMsg} submitted successfully!`);
      if (!isNote) {
        renderBoothList();
        showListView();
      }
    } catch (err) {
      console.error('Webhook error:', err);
      alert('Error submitting. Please try again.');
      modal.querySelector('#submit-webhook-btn').disabled = false;
      const btnText = isDemo ? 'Demo' : isNote ? 'Create Note' : 'Follow Up';
      const btnIcon = isNote ? 'fab fa-hubspot' : 'fas fa-paper-plane';
      modal.querySelector('#submit-webhook-btn').innerHTML = `<i class="${btnIcon}"></i> Submit ${btnText}`;
    }
  });
}

function showAddLeadModal() {
  const show = shows.find(s => s.id === currentShowId);
  const platformOptions = ['Shopify', 'Shopify Plus', 'BigCommerce', 'WooCommerce', 'Magento', 'Custom', 'Other', 'Unknown'];
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content" style="max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>Add New Lead</h2>
        <button class="close-modal-btn"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <h3 style="margin-bottom: 12px; font-size: 14px; color: #888;">Company Info</h3>
        <div class="form-group">
          <label>Company Name *</label>
          <input type="text" class="input" id="add-company-name" placeholder="e.g., Acme Foods">
        </div>
        <div class="form-group">
          <label>Booth Number</label>
          <input type="text" class="input" id="add-booth-number" placeholder="e.g., 1234">
        </div>
        <div class="form-group">
          <label>Domain</label>
          <input type="text" class="input" id="add-domain" placeholder="e.g., acmefoods.com">
        </div>
        <div class="form-group">
          <label>Platform</label>
          <select class="input" id="add-platform">
            <option value="">Select platform...</option>
            ${platformOptions.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Est. Monthly Sales</label>
          <input type="text" class="input" id="add-sales" placeholder="e.g., 50000">
        </div>
        
        <h3 style="margin: 20px 0 12px; font-size: 14px; color: #888;">Contact Info</h3>
        <div class="form-group">
          <label>Contact Name</label>
          <input type="text" class="input" id="add-contact-name" placeholder="e.g., John Smith">
        </div>
        <div class="form-group">
          <label>Contact Email</label>
          <input type="email" class="input" id="add-contact-email" placeholder="e.g., john@acmefoods.com">
        </div>
        <div class="form-group">
          <label>Contact Phone</label>
          <input type="tel" class="input" id="add-contact-phone" placeholder="e.g., 555-123-4567">
        </div>
        
        <h3 style="margin: 20px 0 12px; font-size: 14px; color: #888;">Notes</h3>
        <div class="form-group">
          <textarea class="input" id="add-notes" rows="3" placeholder="Any additional notes..."></textarea>
        </div>
        
        <button class="btn primary full" id="save-lead-btn">
          <i class="fas fa-plus"></i> Add Lead
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.close-modal-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#save-lead-btn').addEventListener('click', async () => {
    const companyName = modal.querySelector('#add-company-name').value.trim();
    if (!companyName) {
      alert('Company name is required');
      return;
    }
    
    const newBooth = {
      id: `manual-${Date.now()}`,
      showId: currentShowId,
      listType: LIST_TYPES.HIT_LIST,
      repId: currentRepId,
      companyName: companyName,
      boothNumber: modal.querySelector('#add-booth-number').value.trim(),
      domain: modal.querySelector('#add-domain').value.trim(),
      platform: modal.querySelector('#add-platform').value,
      estimatedMonthlySales: parseFloat(modal.querySelector('#add-sales').value.replace(/[^0-9.]/g, '')) || 0,
      contactName: modal.querySelector('#add-contact-name').value.trim(),
      contactEmail: modal.querySelector('#add-contact-email').value.trim(),
      contactPhone: modal.querySelector('#add-contact-phone').value.trim(),
      notes: modal.querySelector('#add-notes').value.trim(),
      status: STATUS.NOT_VISITED,
      isManualEntry: true,
      createdAt: new Date().toISOString()
    };
    
    try {
      modal.querySelector('#save-lead-btn').disabled = true;
      modal.querySelector('#save-lead-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      
      await saveBooth(newBooth);
      booths.push(newBooth);
      
      modal.remove();
      renderBoothList();
      alert('Lead added successfully!');
    } catch (err) {
      console.error('Error saving lead:', err);
      alert('Error saving lead. Please try again.');
      modal.querySelector('#save-lead-btn').disabled = false;
      modal.querySelector('#save-lead-btn').innerHTML = '<i class="fas fa-plus"></i> Add Lead';
    }
  });
}

function openSlack() {
  window.location.href = 'slack://channel?team=T05MZUWTJPX&id=C05NH7DQB4K';
}

// Camera
async function openCamera() {
  try {
    if (!cameraStream || cameraStream.getTracks().every(t => t.readyState === 'ended')) {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      document.getElementById('camera-video').srcObject = cameraStream;
    }
    document.getElementById('camera-modal').classList.remove('hidden');
  } catch (err) { alert('Camera access denied'); }
}

function closeCameraModal() {
  document.getElementById('camera-modal').classList.add('hidden');
}

function releaseCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('camera-video').srcObject = null;
}

async function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  
  // Show uploading indicator
  const captureBtn = document.getElementById('capture-btn');
  const originalText = captureBtn.innerHTML;
  captureBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  captureBtn.disabled = true;
  
  // Upload to Supabase Storage and get URL
  const imageUrl = await uploadBusinessCard(dataUrl, currentBoothId);
  
  if (imageUrl) {
    await updateBoothField('businessCardUrl', imageUrl);
    await updateBoothField('businessCardData', dataUrl); // Keep local preview
  } else {
    // Fallback to just storing base64 locally
    await updateBoothField('businessCardData', dataUrl);
  }
  
  captureBtn.innerHTML = originalText;
  captureBtn.disabled = false;
  
  closeCameraModal();
  showDetailView(currentBoothId);
}

async function removeCard() {
  await updateBoothField('businessCardData', null);
  await updateBoothField('businessCardUrl', null);
  showDetailView(currentBoothId);
}

// File Upload Functions
async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  
  const attachments = booth.attachments || [];
  
  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    
    if (!isImage && !isPdf) {
      alert(`Skipping ${file.name}: Only images and PDFs allowed`);
      continue;
    }
    
    try {
      // Upload to Supabase Storage
      const url = await uploadAttachment(file, currentBoothId);
      if (url) {
        attachments.push({
          name: file.name,
          type: isImage ? 'image' : 'pdf',
          url: url,
          uploadedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert(`Error uploading ${file.name}`);
    }
  }
  
  booth.attachments = attachments;
  await saveBooth(booth);
  showDetailView(currentBoothId);
}

async function deleteAttachment(idx) {
  if (!confirm('Delete this file?')) return;
  
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth || !booth.attachments) return;
  
  booth.attachments.splice(idx, 1);
  await saveBooth(booth);
  showDetailView(currentBoothId);
}

// ============ FILTERS ============

function showFilterModal() {
  tempFilters = { ...filters };
  renderFilterOptions();
  document.getElementById('filter-modal').classList.remove('hidden');
}

function hideFilterModal() {
  document.getElementById('filter-modal').classList.add('hidden');
}

function renderFilterOptions() {
  const container = document.getElementById('filter-options');
  const multiArrayKeys = ['platforms', 'statuses', 'protections', 'returns', 'helpDesks', 'subscriptions'];

  const sel = key => tempFilters[key] || [];

  const statusOrder = [STATUS.NOT_VISITED, STATUS.COME_BACK, STATUS.FOLLOW_UP_WARM, STATUS.FOLLOW_UP_WARM_DIRECT, STATUS.FOLLOW_UP_WARM_INTRO, STATUS.FOLLOW_UP_COLD, STATUS.DEMO_BOOKED, STATUS.NOT_INTERESTED, STATUS.DQ, STATUS.NOT_AT_SHOW];

  container.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-title">Status (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('statuses').length === 0 ? 'active' : ''}" data-filter="statuses" data-value="all">All</button>
        ${statusOrder.map(v => `<button class="filter-option ${sel('statuses').includes(v) ? 'active' : ''}" data-filter="statuses" data-value="${v}">${STATUS_LABELS[v]}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Min Revenue</div>
      <div class="filter-options">
        ${REVENUE_THRESHOLDS.map(t => `<button class="filter-option ${tempFilters.minRevenue === t ? 'active' : ''}" data-filter="minRevenue" data-value="${t}">${t === 0 ? 'Any' : '≥ ' + formatCurrency(t)}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Hall / Level</div>
      <div class="filter-options">
        ${getHallOptionsForCurrentShow().map(h => `<button class="filter-option ${tempFilters.hall === h.value ? 'active' : ''}" data-filter="hall" data-value="${h.value}">${h.label}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Protection (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('protections').length === 0 ? 'active' : ''}" data-filter="protections" data-value="all">All</button>
        <button class="filter-option ${sel('protections').includes('[No Protection]') ? 'active' : ''}" data-filter="protections" data-value="[No Protection]">None</button>
        ${PROTECTION_PROVIDERS.filter(p => p !== '[No Protection]').map(p => `<button class="filter-option ${sel('protections').includes(p) ? 'active' : ''}" data-filter="protections" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Help Desk (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('helpDesks').length === 0 ? 'active' : ''}" data-filter="helpDesks" data-value="all">All</button>
        <button class="filter-option ${sel('helpDesks').includes('[No Help Desk]') ? 'active' : ''}" data-filter="helpDesks" data-value="[No Help Desk]">None</button>
        ${HELPDESK_OPTIONS.map(p => `<button class="filter-option ${sel('helpDesks').includes(p) ? 'active' : ''}" data-filter="helpDesks" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Returns (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('returns').length === 0 ? 'active' : ''}" data-filter="returns" data-value="all">All</button>
        <button class="filter-option ${sel('returns').includes('[No Returns]') ? 'active' : ''}" data-filter="returns" data-value="[No Returns]">None</button>
        ${RETURNS_PROVIDERS.filter(p => p !== '[No Returns]').map(p => `<button class="filter-option ${sel('returns').includes(p) ? 'active' : ''}" data-filter="returns" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Subscriptions (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('subscriptions').length === 0 ? 'active' : ''}" data-filter="subscriptions" data-value="all">All</button>
        <button class="filter-option ${sel('subscriptions').includes('[No Subscriptions]') ? 'active' : ''}" data-filter="subscriptions" data-value="[No Subscriptions]">None</button>
        ${SUBSCRIPTIONS_OPTIONS.map(p => `<button class="filter-option ${sel('subscriptions').includes(p) ? 'active' : ''}" data-filter="subscriptions" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Platform (select multiple)</div>
      <div class="filter-options">
        <button class="filter-option ${sel('platforms').length === 0 ? 'active' : ''}" data-filter="platforms" data-value="all">All</button>
        <button class="filter-option ${sel('platforms').includes('[No Platform]') ? 'active' : ''}" data-filter="platforms" data-value="[No Platform]">None</button>
        ${PLATFORMS.filter(p => p !== '[No Platform]').map(p => `<button class="filter-option ${sel('platforms').includes(p) ? 'active' : ''}" data-filter="platforms" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      const value = btn.dataset.value;
      if (multiArrayKeys.includes(key)) {
        if (value === 'all') {
          tempFilters[key] = [];
        } else {
          const current = tempFilters[key] || [];
          tempFilters[key] = current.includes(value) ? current.filter(x => x !== value) : [...current, value];
        }
      } else if (key === 'minRevenue') {
        tempFilters[key] = parseInt(value);
      } else {
        tempFilters[key] = value;
      }
      renderFilterOptions();
    });
  });
}

function applyFilters() { filters = { ...tempFilters, platforms: [...(tempFilters.platforms || [])], statuses: [...(tempFilters.statuses || [])], protections: [...(tempFilters.protections || [])], returns: [...(tempFilters.returns || [])], helpDesks: [...(tempFilters.helpDesks || [])], subscriptions: [...(tempFilters.subscriptions || [])] }; saveFilters(); hideFilterModal(); renderBoothList(); }
function clearFilters() { filters = { ...DEFAULT_FILTERS }; tempFilters = { ...filters, platforms: [], statuses: [], protections: [], returns: [], helpDesks: [], subscriptions: [] }; saveFilters(); hideFilterModal(); renderBoothList(); }

// ============ LIST ACTIONS ============

function toggleListActionsMenu() {
  document.getElementById('list-actions-menu').classList.toggle('hidden');
}

function showReimportModal() {
  document.getElementById('list-actions-menu').classList.add('hidden');
  // Pre-select current show/rep/list in admin import tab
  showAdminModal();
  showAdminTab('import');
  
  // Set the dropdowns to current context after a tick (DOM needs to render)
  setTimeout(() => {
    const showSelect = document.getElementById('import-show');
    const repSelect = document.getElementById('import-rep');
    const listSelect = document.getElementById('import-list-type');
    
    if (showSelect && currentShowId) showSelect.value = currentShowId;
    if (repSelect) repSelect.value = currentRepId || '';
    if (listSelect && currentListType) listSelect.value = currentListType;
  }, 50);
}

async function clearCurrentList() {
  document.getElementById('list-actions-menu').classList.add('hidden');
  
  const listLabel = LIST_LABELS[currentListType] || currentListType;
  const rep = reps.find(r => r.id === currentRepId);
  const repName = rep ? rep.name + "'s " : '';
  
  if (!confirm(`Delete all booths from ${repName}${listLabel}?\n\nThis cannot be undone.`)) return;
  
  await deleteBoothsForList(currentShowId, currentRepId, currentListType);
  await loadBoothList();
  renderBoothList();
}

// ============ DASHBOARD ============

async function renderDashboard() {
  const [stats, allBooths] = await Promise.all([
    getDashboardStats(currentShowId),
    getAllBoothsForShow(currentShowId)
  ]);
  dashboardBooths = allBooths;
  const container = document.getElementById('dashboard-content');

  const totals = stats.reduce((acc, s) => ({
    demos: acc.demos + s.demos,
    followUpWarm: acc.followUpWarm + s.followUpWarm,
    followUpCold: acc.followUpCold + s.followUpCold,
    followUp: acc.followUp + s.followUp,
    notAtShow: acc.notAtShow + s.notAtShow,
    businessCards: acc.businessCards + s.businessCards
  }), { demos: 0, followUpWarm: 0, followUpCold: 0, followUp: 0, notAtShow: 0, businessCards: 0 });

  const boothsByStatus = (statuses) => allBooths.filter(b => statuses.includes(b.status));
  const warmBooths = boothsByStatus([STATUS.FOLLOW_UP_WARM, STATUS.FOLLOW_UP_WARM_DIRECT, STATUS.FOLLOW_UP_WARM_INTRO]);
  const coldBooths = boothsByStatus([STATUS.FOLLOW_UP_COLD]);
  const demoBooths = boothsByStatus([STATUS.DEMO_BOOKED]);
  const notAtShowBooths = boothsByStatus([STATUS.NOT_AT_SHOW]);

  const boothRow = (b) => {
    const rep = stats.find(s => s.repId === b.repId);
    const contact = b.contactName ? `<span class="dash-contact">${b.contactName}${b.contactEmail ? ` · ${b.contactEmail}` : ''}</span>` : '';
    return `<div class="dash-lead-row" data-booth-id="${b.id}">
      <span class="dash-company">${b.companyName || 'Unknown'}</span>
      <span class="dash-rep">${rep?.repName || ''}</span>
      ${b.contactEmail ? `<span class="dash-hs-status" data-email="${b.contactEmail}"></span>` : ''}
      ${contact}
      ${b.notes ? `<span class="dash-notes">${b.notes.slice(0, 80)}${b.notes.length > 80 ? '…' : ''}</span>` : ''}
    </div>`;
  };

  const expandable = (id, rows) => rows.length === 0 ? '' : `
    <div class="dash-leads hidden" id="dash-leads-${id}">
      ${rows.map(boothRow).join('')}
    </div>`;

  container.innerHTML = `
    <div class="dashboard-actions">
      <button class="btn secondary small dash-hs-sync-btn" id="sync-hs-btn"><i class="fab fa-hubspot"></i> Check HubSpot</button>
      <button class="btn primary small dash-hs-bulk-btn" id="bulk-sync-hs-btn"><i class="fab fa-hubspot"></i> Bulk Sync to HubSpot</button>
    </div>
    <div id="bulk-sync-progress" class="bulk-sync-progress hidden"></div>
    <div class="dashboard-totals">
      <div class="total-card green dash-expandable" data-target="demos">
        <span class="total-value">${totals.demos}</span><label>Demos <i class="fas fa-chevron-down"></i></label>
      </div>
      <div class="total-card orange dash-expandable" data-target="warm">
        <span class="total-value">${totals.followUpWarm}</span><label>Warm <i class="fas fa-chevron-down"></i></label>
      </div>
      <div class="total-card blue dash-expandable" data-target="cold">
        <span class="total-value">${totals.followUpCold}</span><label>Cold F/U <i class="fas fa-chevron-down"></i></label>
      </div>
      <div class="total-card dash-expandable" data-target="noshow">
        <span class="total-value">${totals.notAtShow}</span><label>Not at Show <i class="fas fa-chevron-down"></i></label>
      </div>
    </div>
    ${expandable('demos', demoBooths)}
    ${expandable('warm', warmBooths)}
    ${expandable('cold', coldBooths)}
    ${expandable('noshow', notAtShowBooths)}
    <div class="section-title" style="padding:16px 16px 8px">Rep Rankings</div>
    <div class="leaderboard">
      ${stats.map((s, i) => `
        <div class="leaderboard-row">
          <span class="rank ${i === 0 ? 'first' : ''}">${i + 1}</span>
          <span class="rep-name">${s.repName}</span>
          <div class="rep-stats">
            <span class="stat-pill green">${s.demos} demos</span>
            <span class="stat-pill orange">${s.followUpWarm} warm</span>
            <span class="stat-pill blue">${s.followUpCold} cold</span>
          </div>
        </div>
        <div class="rep-details">
          <span class="detail-stat"><i class="fas fa-redo-alt"></i> ${s.comeBack} come back</span>
          <span class="detail-stat"><i class="fas fa-thumbs-down"></i> ${s.notInterested} not interested</span>
          <span class="detail-stat"><i class="fas fa-ban"></i> ${s.dq} DQ</span>
          <span class="detail-stat"><i class="fas fa-store-slash"></i> ${s.notAtShow} not at show</span>
          <span class="detail-stat"><i class="fas fa-id-card"></i> ${s.businessCards} cards</span>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.dash-expandable').forEach(card => {
    card.addEventListener('click', () => {
      const panel = document.getElementById(`dash-leads-${card.dataset.target}`);
      if (!panel) return;
      panel.classList.toggle('hidden');
      card.querySelector('i').className = panel.classList.contains('hidden') ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
    });
  });

  document.getElementById('sync-hs-btn')?.addEventListener('click', syncHubSpot);
  document.getElementById('bulk-sync-hs-btn')?.addEventListener('click', bulkSyncToHubSpot);
}

async function syncHubSpot() {
  const btn = document.getElementById('sync-hs-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

  const statusEls = document.querySelectorAll('.dash-hs-status[data-email]');
  statusEls.forEach(el => { el.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:10px;color:var(--text-muted)"></i>'; });

  document.querySelectorAll('.dash-leads').forEach(p => {
    p.classList.remove('hidden');
    const card = document.querySelector(`[data-target="${p.id.replace('dash-leads-', '')}"]`);
    if (card) card.querySelector('i').className = 'fas fa-chevron-up';
  });

  const hsCall = async (body) => {
    const res = await fetch(HUBSPOT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body)
    });
    return res.json();
  };

  const checkEmail = async (email) => {
    try {
      const data = await hsCall({ action: 'search', email });
      return { found: data.found, id: data.id };
    } catch {
      return { found: null };
    }
  };

  const createContact = async (el) => {
    const row = el.closest('.dash-lead-row');
    const booth = dashboardBooths.find(b => b.id === row?.dataset.boothId);
    if (!booth) return;

    const nameParts = (booth.contactName || '').trim().split(' ');
    el.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:10px"></i>';
    try {
      const data = await hsCall({ action: 'create', properties: {
        email: booth.contactEmail,
        firstname: nameParts[0] || '',
        lastname: nameParts.slice(1).join(' ') || '',
        company: booth.companyName || '',
        jobtitle: booth.contactTitle || '',
        phone: booth.contactPhone || ''
      }});
      if (data.id) {
        const url = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${data.id}`;
        el.innerHTML = `<a href="${url}" target="_blank" class="hs-badge found"><i class="fab fa-hubspot"></i> Created</a>`;
      } else {
        el.innerHTML = `<span class="hs-badge missing" title="${data.error || ''}"><i class="fas fa-times"></i> Error</span>`;
      }
    } catch {
      el.innerHTML = `<span class="hs-badge missing"><i class="fas fa-times"></i> Error</span>`;
    }
  };

  await Promise.all(Array.from(statusEls).map(async (el) => {
    const email = el.dataset.email;
    const result = await checkEmail(email);
    if (result.found === true) {
      const url = result.id ? `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${result.id}` : '#';
      el.innerHTML = `<a href="${url}" target="_blank" class="hs-badge found"><i class="fab fa-hubspot"></i> In HubSpot</a>`;
    } else if (result.found === false) {
      el.innerHTML = `<span class="hs-badge missing"><i class="fas fa-times-circle"></i> Not in HubSpot <button class="hs-create-btn">Create</button></span>`;
      el.querySelector('.hs-create-btn').addEventListener('click', (e) => { e.preventDefault(); createContact(el); });
    } else {
      el.innerHTML = `<span class="hs-badge missing"><i class="fas fa-exclamation-triangle"></i> Error</span>`;
    }
  }));

  btn.disabled = false;
  btn.innerHTML = '<i class="fab fa-hubspot"></i> Check HubSpot';
}

async function bulkSyncToHubSpot() {
  const show = shows.find(s => s.id === currentShowId);
  const syncable = (dashboardBooths || []).filter(b => HS_SYNC_STATUSES.has(b.status));

  if (syncable.length === 0) {
    alert('No Follow Up or Demo Booked leads to sync for this show.');
    return;
  }

  const confirmed = confirm(
    `Sync ${syncable.length} lead${syncable.length !== 1 ? 's' : ''} to HubSpot for ${show?.name || 'this show'}?\n\n` +
    `This will create/update contacts and create deals for Demo Booked entries. Already-synced records will be skipped or updated safely.`
  );
  if (!confirmed) return;

  const btn = document.getElementById('bulk-sync-hs-btn');
  const progress = document.getElementById('bulk-sync-progress');
  btn.disabled = true;
  progress.classList.remove('hidden');

  let done = 0, created = 0, updated = 0, deals = 0, errors = 0;

  const updateProgress = (msg) => {
    progress.innerHTML = `<span>${msg}</span>`;
  };

  for (const booth of syncable) {
    updateProgress(`Syncing ${done + 1} of ${syncable.length}: ${booth.companyName || 'Unknown'}…`);
    try {
      const res = await fetch(HUBSPOT_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          action: 'sync',
          booth,
          showName: show?.name || '',
          isDemoBooked: booth.status === STATUS.DEMO_BOOKED,
        }),
      });
      const data = await res.json();
      if (data.error) {
        errors++;
      } else {
        if (data.contactCreated) created++; else if (data.contactId) updated++;
        if (data.dealId) deals++;

        // Persist HubSpot IDs back to the booth record
        const live = booths.find(b => b.id === booth.id);
        if (live) {
          if (data.contactId && !live.recordId) live.recordId = data.contactId;
          if (data.dealId    && !live.hsDealId)  live.hsDealId = data.dealId;
          if (data.contactId || data.dealId) await saveBooth(live);
        }
        // Also update dashboardBooths reference so re-check sees fresh IDs
        if (data.contactId && !booth.recordId) booth.recordId = data.contactId;
        if (data.dealId    && !booth.hsDealId)  booth.hsDealId = data.dealId;
      }
    } catch {
      errors++;
    }
    done++;
  }

  const parts = [];
  if (created) parts.push(`${created} new contact${created !== 1 ? 's' : ''}`);
  if (updated) parts.push(`${updated} updated`);
  if (deals)   parts.push(`${deals} deal${deals !== 1 ? 's' : ''} created`);
  if (errors)  parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);

  updateProgress(`Done — ${syncable.length} leads synced. ${parts.join(' · ') || 'Nothing new to sync.'}`);
  btn.disabled = false;
  btn.innerHTML = '<i class="fab fa-hubspot"></i> Bulk Sync to HubSpot';
}

async function checkCrmBotStatus(booth) {
  const badge = document.getElementById('crm-bot-badge');
  if (!badge) return;

  if (!booth.contactEmail) {
    badge.className = 'crm-bot-badge missing';
    badge.innerHTML = '<i class="fas fa-times-circle"></i> Not in HubSpot';
    return;
  }

  try {
    const res = await fetch(HUBSPOT_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ action: 'search', email: booth.contactEmail })
    });
    const data = await res.json();
    if (data.found) {
      const url = data.id ? `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/${data.id}` : '#';
      badge.className = 'crm-bot-badge found';
      badge.innerHTML = `<a href="${url}" target="_blank"><i class="fab fa-hubspot"></i> In HubSpot</a>`;
    } else {
      badge.className = 'crm-bot-badge missing';
      badge.innerHTML = '<i class="fas fa-times-circle"></i> Not in HubSpot';
    }
  } catch {
    badge.className = 'crm-bot-badge missing';
    badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> No Contact Data';
  }
}

async function draftEmail(boothId) {
  const booth = booths.find(b => b.id === boothId);
  if (!booth) return;

  const btn = document.getElementById('draft-email-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Drafting...';

  try {
    const res = await fetch(DRAFT_EMAIL_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        companyName: booth.companyName,
        contactName: booth.contactName,
        contactTitle: booth.contactTitle,
        platform: booth.platform,
        status: booth.status,
        protection: booth.protection,
        returns: booth.returns,
        helpDesk: booth.helpDesk,
        subscriptions: booth.subscriptions,
        notes: booth.notes,
        estimatedMonthlySales: booth.estimatedMonthlySales
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    showEmailDraftModal(data.subject || '', data.body || data.email || '');
  } catch (err) {
    alert(`Could not draft email: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Draft Follow-Up Email';
  }
}

function showEmailDraftModal(subject, body) {
  document.getElementById('email-draft-subject').textContent = subject;
  document.getElementById('email-draft-body').textContent = body;
  document.getElementById('email-draft-modal').classList.remove('hidden');

  document.getElementById('copy-email-btn').onclick = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
      const btn = document.getElementById('copy-email-btn');
      btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
    });
  };

  document.getElementById('mailto-email-btn').onclick = () => {
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };
}

function hideEmailDraftModal() {
  document.getElementById('email-draft-modal').classList.add('hidden');
}

async function exportDashboard() {
  const csv = await exportToCSV(currentShowId);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${currentShowId}_export.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ============ ADMIN ============

function showAdminModal() { 
  document.getElementById('admin-modal').classList.remove('hidden'); 
  renderAdminTabs();
  // If a show is selected, show that show's settings by default
  if (currentShowId) {
    showAdminTab('current-show');
  } else {
    showAdminTab('shows'); 
  }
}
function hideAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

function renderAdminTabs() {
  const container = document.getElementById('admin-tabs');
  const showSelected = !!currentShowId;
  
  container.innerHTML = `
    ${showSelected ? '<button class="admin-tab active" data-tab="current-show">This Show</button>' : ''}
    <button class="admin-tab ${!showSelected ? 'active' : ''}" data-tab="shows">All Shows</button>
    <button class="admin-tab" data-tab="reps">Reps</button>
    <button class="admin-tab" data-tab="import">Import</button>
    <button class="admin-tab" data-tab="integrations">Integrations</button>
  `;
  container.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      showAdminTab(btn.dataset.tab);
    });
  });
}

function showAdminTab(tab) {
  const content = document.getElementById('admin-content');
  
  if (tab === 'current-show') {
    const show = shows.find(s => s.id === currentShowId);
    if (!show) return showAdminTab('shows');
    
    const showReps = show.reps || show.reps || reps.map(r => r.id);
    
    content.innerHTML = `
      <div class="admin-section">
        <h3 style="margin-bottom: 16px;">${show.name}</h3>
        <div class="admin-field">
          <label>Location</label>
          <span>${show.location || '-'}</span>
        </div>
        <div class="admin-field">
          <label>Dates</label>
          <span>${show.startDate || '-'} to ${show.endDate || '-'}</span>
        </div>
        <div class="admin-field">
          <label>Exhibitor List URL</label>
          <input type="text" class="input" id="show-exhibitor-url" value="${show.exhibitorList || show.exhibitor_list || ''}" placeholder="https://...">
        </div>
        <div class="admin-field">
          <label>Aligned Room URL</label>
          <input type="text" class="input" id="show-aligned-url" value="${show.alignedRoomUrl || show.aligned_room_url || ''}" placeholder="https://...">
        </div>
        <button class="btn secondary full" id="save-show-urls-btn" style="margin-top: 12px;"><i class="fas fa-save"></i> Save URLs</button>
      </div>
      
      <div class="admin-section" style="margin-top: 24px;">
        <h4 style="margin-bottom: 12px;">Hall / Booth Mapping</h4>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Configure how booth numbers map to halls for filtering. Each rule matches booths by prefix and/or numeric range.</p>
        <div id="hall-rules-list" class="hall-rules-list">
          ${renderHallRules(show.hallConfig || show.hall_config)}
        </div>
        <button class="btn secondary" id="add-hall-rule-btn" style="margin-top: 8px;"><i class="fas fa-plus"></i> Add Rule</button>
        <button class="btn primary full" id="save-hall-config-btn" style="margin-top: 12px;"><i class="fas fa-save"></i> Save Hall Config</button>
      </div>
      
      <div class="admin-section" style="margin-top: 24px;">
        <h4 style="margin-bottom: 12px;">Reps Attending This Show</h4>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Unchecked reps won't appear in hit lists or dashboard for this show.</p>
        <div class="rep-roster-list">
          ${reps.map(r => `
            <label class="rep-roster-item">
              <input type="checkbox" class="rep-roster-checkbox" data-rep-id="${r.id}" ${showReps.includes(r.id) ? 'checked' : ''}>
              <span>${r.name}</span>
            </label>
          `).join('')}
        </div>
        <button class="btn primary full" id="save-roster-btn" style="margin-top: 12px;"><i class="fas fa-save"></i> Save Rep Roster</button>
      </div>
    `;
    
    document.getElementById('save-show-urls-btn').addEventListener('click', async () => {
      show.exhibitorList = document.getElementById('show-exhibitor-url').value;
      show.exhibitor_list = show.exhibitorList;
      show.alignedRoomUrl = document.getElementById('show-aligned-url').value;
      show.aligned_room_url = show.alignedRoomUrl;
      await saveShow(show);
      shows = await getShows();
      alert('URLs saved!');
    });
    
    // Hall config event listeners
    document.getElementById('add-hall-rule-btn').addEventListener('click', () => {
      const list = document.getElementById('hall-rules-list');
      const ruleIndex = list.querySelectorAll('.hall-rule-row').length;
      const newRow = document.createElement('div');
      newRow.className = 'hall-rule-row';
      newRow.innerHTML = `
        <input type="text" class="input hall-prefix" placeholder="Prefix (e.g. N, C)" style="width: 60px;">
        <input type="number" class="input hall-min" placeholder="Min #" style="width: 70px;">
        <input type="number" class="input hall-max" placeholder="Max #" style="width: 70px;">
        <input type="text" class="input hall-name" placeholder="Hall Name" style="flex: 1;">
        <input type="text" class="input hall-category" placeholder="Category" style="flex: 1;">
        <button class="btn-icon delete-rule-btn"><i class="fas fa-trash"></i></button>
      `;
      list.appendChild(newRow);
      newRow.querySelector('.delete-rule-btn').addEventListener('click', () => newRow.remove());
    });
    
    document.getElementById('save-hall-config-btn').addEventListener('click', async () => {
      const rules = [];
      document.querySelectorAll('.hall-rule-row').forEach(row => {
        const prefix = row.querySelector('.hall-prefix')?.value?.trim().toUpperCase() || '';
        const minNum = row.querySelector('.hall-min')?.value ? parseInt(row.querySelector('.hall-min').value) : undefined;
        const maxNum = row.querySelector('.hall-max')?.value ? parseInt(row.querySelector('.hall-max').value) : undefined;
        const hall = row.querySelector('.hall-name')?.value?.trim() || '';
        const category = row.querySelector('.hall-category')?.value?.trim() || '';
        
        if (hall) { // Only add if hall name is provided
          rules.push({ prefix, minNum, maxNum, hall, category });
        }
      });
      
      show.hallConfig = { rules };
      show.hall_config = { rules };
      await saveShow(show);
      shows = await getShows();
      
      // Update HALL_OPTIONS based on new config
      updateHallOptionsForShow(show);
      
      alert('Hall configuration saved!');
    });
    
    // Add delete handlers to existing rules
    document.querySelectorAll('.delete-rule-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.hall-rule-row').remove());
    });
    
    document.getElementById('save-roster-btn').addEventListener('click', async () => {
      const checkedReps = Array.from(content.querySelectorAll('.rep-roster-checkbox:checked'))
        .map(cb => cb.dataset.repId);
      show.reps = checkedReps;
      await saveShow(show);
      shows = await getShows();
      alert('Rep roster saved!');
      renderRepList(); // Refresh rep list if visible
    });
    
  } else if (tab === 'shows') {
    content.innerHTML = `
      <div class="admin-list">${shows.map(s => `<div class="admin-item"><span>${s.name}</span><span class="muted">${s.location || ''}</span></div>`).join('')}</div>
      <button class="btn primary full" id="add-show-btn"><i class="fas fa-plus"></i> Add Show</button>
    `;
    document.getElementById('add-show-btn').addEventListener('click', addShowPrompt);
  } else if (tab === 'reps') {
    content.innerHTML = `
      <div class="admin-list">${reps.map(r => `<div class="admin-item"><span>${r.name}</span></div>`).join('')}</div>
      <button class="btn primary full" id="add-rep-btn"><i class="fas fa-plus"></i> Add Rep</button>
    `;
    document.getElementById('add-rep-btn').addEventListener('click', addRepPrompt);
  } else if (tab === 'import') {
    content.innerHTML = `
      <div class="import-section">
        <label>Select Show</label>
        <select id="import-show" class="input">${shows.map(s => `<option value="${s.id}" ${s.id === currentShowId ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
        
        <label>List Type</label>
        <select id="import-list-type" class="input">
          <option value="${LIST_TYPES.HIT_LIST}">Hit List</option>
          <option value="${LIST_TYPES.CUSTOMERS}">Customers</option>
          <option value="${LIST_TYPES.WORKING}">Working</option>
          <option value="${LIST_TYPES.OPPS}">Opps</option>
          <option value="${LIST_TYPES.INACTIVE_CUSTOMERS}">Inactive Customers</option>
          <option value="${LIST_TYPES.PEOPLE}">People</option>
        </select>
        
        <div id="rep-select-row">
          <label>Select Rep (for Hit List only)</label>
          <select id="import-rep" class="input">
            <option value="">-- No Rep --</option>
            ${reps.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
          </select>
        </div>
        
        <label>Upload CSV File</label>
        <input type="file" id="import-file" class="input" accept=".csv,.tsv,.txt">
        
        <div class="divider">OR</div>
        
        <label>Paste Data (Tab or Comma delimited)</label>
        <textarea id="import-paste" class="input" rows="6" placeholder="Paste from Google Sheets or Excel..."></textarea>
        <button class="btn primary full" id="import-paste-btn"><i class="fas fa-paste"></i> Import Data</button>
        
        <div class="divider">TOOLS</div>
        
        <div class="hubspot-url-section">
          <label>Generate HubSpot URLs</label>
          <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Creates HubSpot company URLs from record_id field for all booths in the selected show.</p>
          <button class="btn secondary full" id="generate-hubspot-urls-btn"><i class="fas fa-link"></i> Generate HubSpot URLs</button>
          <div id="hubspot-url-status" style="margin-top: 8px; font-size: 13px;"></div>
        </div>
      </div>
    `;
    
    // Show/hide rep select based on list type
    const listTypeSelect = document.getElementById('import-list-type');
    const repRow = document.getElementById('rep-select-row');
    listTypeSelect.addEventListener('change', () => {
      repRow.style.display = listTypeSelect.value === LIST_TYPES.HIT_LIST ? 'block' : 'none';
    });
    
    document.getElementById('import-file').addEventListener('change', importFromFile);
    document.getElementById('import-paste-btn').addEventListener('click', importFromPaste);
    document.getElementById('generate-hubspot-urls-btn').addEventListener('click', generateHubSpotUrls);
  } else if (tab === 'integrations') {
    content.innerHTML = `
      <div class="admin-section">
        <h4 style="margin-bottom: 8px;">HubSpot</h4>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Token is managed server-side in Supabase — no per-device setup needed.</p>
        <button class="btn secondary" id="test-hs-btn"><i class="fab fa-hubspot"></i> Test Connection</button>
        <div id="hs-test-result" style="margin-top: 10px; font-size: 13px;"></div>
      </div>
    `;
    document.getElementById('test-hs-btn').addEventListener('click', async () => {
      const btn = document.getElementById('test-hs-btn');
      const result = document.getElementById('hs-test-result');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
      try {
        const res = await fetch(HUBSPOT_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ action: 'search', email: 'test@test.com' })
        });
        const data = await res.json();
        if (data.error && data.error.includes('HUBSPOT_TOKEN')) {
          result.innerHTML = '<span style="color:var(--red)"><i class="fas fa-times-circle"></i> Token not configured in Supabase</span>';
        } else {
          result.innerHTML = '<span style="color:var(--green)"><i class="fas fa-check-circle"></i> Connected</span>';
        }
      } catch {
        result.innerHTML = '<span style="color:var(--red)"><i class="fas fa-times-circle"></i> Could not reach server</span>';
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fab fa-hubspot"></i> Test Connection';
    });
  }
}

async function addShowPrompt() {
  const name = prompt('Show name:'); if (!name) return;
  const location = prompt('Location:') || '';
  const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
  try {
    await saveShow({ id, name, location, startDate: null, endDate: null, website: '', exhibitorList: '' });
    shows = await getShows();
    renderShowList();
    showAdminTab('shows');
  } catch (e) {
    alert('Error saving show: ' + (e.message || e));
  }
}

async function addRepPrompt() {
  const name = prompt('Rep name:'); if (!name) return;
  const id = name.toLowerCase().replace(/\s+/g, '_');
  await saveRep({ id, name });
  reps = await getReps();
  showAdminTab('reps');
}

// ============ IMPORT ============

// HubSpot portal ID - used for generating company URLs
const HUBSPOT_PORTAL_ID = '22466049';

async function generateHubSpotUrls() {
  const showId = document.getElementById('import-show').value;
  const statusDiv = document.getElementById('hubspot-url-status');
  
  if (!showId) {
    statusDiv.innerHTML = '<span style="color: var(--warning);">Please select a show first.</span>';
    return;
  }
  
  statusDiv.innerHTML = '<span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading booths...</span>';
  
  try {
    // Get all booths for this show
    const allBooths = await getBooths(showId, null, null);
    
    // Filter to booths with record_id but no hubspot_url
    const boothsToUpdate = allBooths.filter(b => 
      b.recordId && (!b.hubspotUrl || b.hubspotUrl === '')
    );
    
    if (boothsToUpdate.length === 0) {
      statusDiv.innerHTML = '<span style="color: var(--success);">All booths with record IDs already have HubSpot URLs.</span>';
      return;
    }
    
    statusDiv.innerHTML = `<span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Updating ${boothsToUpdate.length} booths...</span>`;
    
    // Update each booth with generated HubSpot URL
    let updated = 0;
    let errors = 0;
    
    for (const booth of boothsToUpdate) {
      try {
        booth.hubspotUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/record/0-2/${booth.recordId}`;
        await saveBooth(booth);
        updated++;
        
        // Update progress every 10 booths
        if (updated % 10 === 0) {
          statusDiv.innerHTML = `<span style="color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Updated ${updated}/${boothsToUpdate.length}...</span>`;
        }
      } catch (e) {
        console.error('Error updating booth:', booth.companyName, e);
        errors++;
      }
    }
    
    statusDiv.innerHTML = `<span style="color: var(--success);"><i class="fas fa-check"></i> Updated ${updated} booths with HubSpot URLs${errors > 0 ? ` (${errors} errors)` : ''}.</span>`;
    
    // Refresh booth list if we're on the list view
    if (currentShowId === showId) {
      booths = await getBooths(currentShowId, currentRepId, currentListType);
      renderBoothList();
    }
  } catch (e) {
    console.error('Error generating HubSpot URLs:', e);
    statusDiv.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Error: ${e.message}</span>`;
  }
}

function importFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    processImportData(text);
  };
  reader.onerror = () => alert('Failed to read file');
  reader.readAsText(file);
}

function importFromPaste() {
  const text = document.getElementById('import-paste').value.trim();
  if (!text) return alert('Paste data first');
  processImportData(text);
}

function processImportData(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return alert('No data found');
  
  // Detect delimiter (tab or comma)
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  
  // Parse with delimiter, handling quoted fields for CSV
  const parseRow = (row) => {
    if (delimiter === ',') {
      // Handle CSV with quoted fields
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    } else {
      return row.split('\t').map(s => s.trim());
    }
  };
  
  const headers = parseRow(lines[0]);
  const dataLines = lines.slice(1).map(parseRow);
  
  pendingImportData = { headers, lines: dataLines };
  
  showMapperModal();
}

function showMapperModal() {
  const { headers } = pendingImportData;
  const listType = document.getElementById('import-list-type').value;
  const fields = CSV_FIELDS[listType] || CSV_FIELDS[LIST_TYPES.HIT_LIST];
  
  // Auto-detect mappings
  columnMapping = {};
  const headerLower = headers.map(h => h.toLowerCase().trim());
  
  fields.forEach(field => {
    // Try to match field label to header
    const labelLower = field.label.toLowerCase();
    let found = headerLower.findIndex(h => h === labelLower || h.includes(labelLower) || labelLower.includes(h));
    
    // Try common variations
    if (found < 0) {
      const variations = {
        companyName: ['company name', 'company', 'name', 'merchant'],
        boothNumber: ['booth', 'booth#', 'booth number', 'booth #'],
        domain: ['domain', 'website', 'url', 'company domain', 'company domain name'],
        estimatedMonthlySales: ['est monthly sales', 'estimated monthly sales', 'monthly sales', 'revenue', 'gmv', 'sales'],
        platform: ['platform', 'ecommerce platform', 'cart'],
        ownerId: ['company owner', 'owner', 'hubspot owner', 'owner id'],
        firstName: ['first name', 'first', 'fname'],
        lastName: ['last name', 'last', 'lname'],
        jobTitle: ['job title', 'title', 'position', 'role'],
        lastContacted: ['last contacted', 'last contact', 'last activity'],
        recordId: ['record id', 'record_id', 'id', 'hubspot id'],
        competitorInstalls: ['competitor tracking - installs', 'competitor installs', 'protection installs'],
        competitorUninstalls: ['competitor tracking - uninstalls', 'competitor uninstalls', 'protection uninstalls'],
        techInstalls: ['tech tracking - installs', 'tech installs', 'technology installs', 'tech tracking'],
        instagramFollowers: ['instagram followers', 'ig followers', 'instagram'],
        facebookFollowers: ['facebook followers', 'fb followers', 'facebook'],
        monthlyVisits: ['estimated monthly visits', 'monthly visits', 'visits', 'traffic'],
        hubspotUrl: ['hubspot company url', 'hubspot url', 'company url', 'hubspot link', 'hs url'],
      };
      
      const patterns = variations[field.key] || [];
      found = headerLower.findIndex(h => patterns.some(p => h.trim() === p.trim() || h.includes(p) || p.includes(h)));
    }
    
    if (found >= 0) columnMapping[field.key] = found;
  });
  
  renderMapperContent();
  document.getElementById('mapper-modal').classList.remove('hidden');
}

function renderMapperContent() {
  const { headers } = pendingImportData;
  const listType = document.getElementById('import-list-type').value;
  const fields = CSV_FIELDS[listType] || CSV_FIELDS[LIST_TYPES.HIT_LIST];
  const container = document.getElementById('mapper-content');
  
  container.innerHTML = `
    <p class="hint">Map your columns to the required fields for <strong>${LIST_LABELS[listType]}</strong>:</p>
    
    <div class="import-mode-toggle">
      <label class="toggle-option">
        <input type="radio" name="import-mode" value="replace" checked>
        <span>Replace All</span>
        <small>Clear existing data, import fresh</small>
      </label>
      <label class="toggle-option">
        <input type="radio" name="import-mode" value="merge">
        <span>Merge / Enrich</span>
        <small>Update existing booths, keep status & notes</small>
      </label>
    </div>
    
    <div class="mapper-grid">
      ${fields.map(field => `
        <div class="mapper-row">
          <label>${field.label}${field.required ? ' *' : ''}</label>
          <select class="input" data-field="${field.key}">
            <option value="">-- Skip --</option>
            ${headers.map((h, i) => `<option value="${i}" ${columnMapping[field.key] === i ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  `;
  
  container.querySelectorAll('select').forEach(sel => {
    sel.addEventListener('change', () => {
      const field = sel.dataset.field;
      columnMapping[field] = sel.value === '' ? undefined : parseInt(sel.value);
    });
  });
}

function hideMapperModal() {
  document.getElementById('mapper-modal').classList.add('hidden');
  pendingImportData = null;
}

async function confirmMapping() {
  try {
    const listType = document.getElementById('import-list-type').value;
    const fields = CSV_FIELDS[listType] || CSV_FIELDS[LIST_TYPES.HIT_LIST];
    const importMode = document.querySelector('input[name="import-mode"]:checked')?.value || 'replace';
    
    // Check required fields
    const requiredFields = fields.filter(f => f.required);
    for (const field of requiredFields) {
      if (columnMapping[field.key] === undefined) {
        return alert(`${field.label} is required`);
      }
    }
    
    const showId = document.getElementById('import-show').value;
    const repId = listType === LIST_TYPES.HIT_LIST ? (document.getElementById('import-rep').value || null) : null;
    
    console.log('Import settings:', { showId, repId, listType, importMode });
    console.log('Column mapping:', columnMapping);
    
    const { lines } = pendingImportData;
    console.log('Lines to import:', lines.length);
    
    // Handle People list separately
    if (listType === LIST_TYPES.PEOPLE) {
      const newPeople = [];
      for (const vals of lines) {
        const person = {
          id: `${showId}_person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          showId,
          firstName: columnMapping.firstName !== undefined ? vals[columnMapping.firstName] || '' : '',
          lastName: columnMapping.lastName !== undefined ? vals[columnMapping.lastName] || '' : '',
          jobTitle: columnMapping.jobTitle !== undefined ? vals[columnMapping.jobTitle] || '' : '',
          companyName: columnMapping.companyName !== undefined ? vals[columnMapping.companyName] || '' : '',
          domain: columnMapping.domain !== undefined ? vals[columnMapping.domain] || '' : '',
          sales: columnMapping.sales !== undefined ? vals[columnMapping.sales] || '' : '',
          dateCompleted: columnMapping.dateCompleted !== undefined ? vals[columnMapping.dateCompleted] || '' : ''
        };
        
        if (person.firstName || person.lastName) newPeople.push(person);
      }
      
      if (newPeople.length === 0) return alert('No valid data found');
      
      await deletePeopleForShow(showId);
      await savePeople(newPeople);
      
      hideMapperModal();
      hideAdminModal();
      alert(`Imported ${newPeople.length} people`);
      return;
    }
    
    // Handle booth-based lists
    const getValue = (vals, key) => columnMapping[key] !== undefined ? (vals[columnMapping[key]] || '') : '';
    const getNumeric = (vals, key) => {
      const val = getValue(vals, key);
      return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
    };
    
    // MERGE MODE: Update existing booths
    if (importMode === 'merge') {
      // Load existing booths for this list
      const existingBooths = await getBooths(showId, repId, listType);
      console.log('Existing booths:', existingBooths.length);
      
      let updated = 0;
      let added = 0;
      let skipped = 0;
      
      // Fields that should NEVER be overwritten in merge mode
      const protectedFields = ['status', 'notes', 'contactName', 'contactEmail', 'contactPhone', 
                               'contactTitle', 'contactExt', 'contactOther', 'ordersPerMonth', 'aov', 'businessCardData', 
                               'claimedBy', 'tag', 'id', 'showId', 'repId', 'listType'];
      
      // Fields that CAN be enriched (only if currently empty)
      const enrichableFields = ['boothNumber', 'domain', 'estimatedMonthlySales', 'platform', 
                                'protection', 'returns', 'recordId', 'ownerId', 'lastContacted',
                                'campaign', 'competitorInstalls', 'competitorUninstalls', 'techInstalls',
                                'instagramFollowers', 'facebookFollowers', 'monthlyVisits', 'hubspotUrl',
                                'associatedDeal', 'associatedDealIds', 'dealRecordId', 'dealName',
                                'appInstalled', 'productOffering'];
      
      for (const vals of lines) {
        const csvCompanyName = getValue(vals, 'companyName')?.trim().toLowerCase();
        const csvDomain = getValue(vals, 'domain')?.trim().toLowerCase();
        
        if (!csvCompanyName) {
          skipped++;
          continue;
        }
        
        // Find matching existing booth by company name OR domain
        const existingBooth = existingBooths.find(b => {
          const existingName = (b.companyName || '').trim().toLowerCase();
          const existingDomain = (b.domain || '').trim().toLowerCase();
          return existingName === csvCompanyName || 
                 (csvDomain && existingDomain && existingDomain === csvDomain);
        });
        
        if (existingBooth) {
          // Merge: only fill in empty fields
          let hasChanges = false;
          
          for (const field of enrichableFields) {
            const currentVal = existingBooth[field];
            const isEmpty = currentVal === undefined || currentVal === null || currentVal === '' || currentVal === 0;
            
            if (isEmpty) {
              let newVal;
              if (['estimatedMonthlySales', 'instagramFollowers', 'facebookFollowers', 'monthlyVisits'].includes(field)) {
                newVal = getNumeric(vals, field);
              } else {
                newVal = getValue(vals, field);
              }
              
              if (newVal && newVal !== 0 && newVal !== '') {
                existingBooth[field] = newVal;
                hasChanges = true;
              }
            }
          }
          
          if (hasChanges) {
            await saveBooth(existingBooth);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // New booth - add it
          const booth = {
            id: `${showId}_${repId || 'shared'}_${listType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            showId,
            repId,
            listType,
            companyName: getValue(vals, 'companyName'),
            boothNumber: getValue(vals, 'boothNumber'),
            domain: getValue(vals, 'domain'),
            estimatedMonthlySales: getNumeric(vals, 'estimatedMonthlySales'),
            platform: getValue(vals, 'platform'),
            protection: getValue(vals, 'protection'),
            returns: getValue(vals, 'returns'),
            status: STATUS.NOT_VISITED,
            notes: '',
            contactName: '',
            ordersPerMonth: 'N/A',
            aov: 'N/A',
            businessCardData: null,
            recordId: getValue(vals, 'recordId'),
            ownerId: getValue(vals, 'ownerId'),
            lastContacted: getValue(vals, 'lastContacted'),
            campaign: getValue(vals, 'campaign'),
            competitorInstalls: getValue(vals, 'competitorInstalls'),
            competitorUninstalls: getValue(vals, 'competitorUninstalls'),
            techInstalls: getValue(vals, 'techInstalls'),
            instagramFollowers: getNumeric(vals, 'instagramFollowers'),
            facebookFollowers: getNumeric(vals, 'facebookFollowers'),
            monthlyVisits: getNumeric(vals, 'monthlyVisits'),
            hubspotUrl: getValue(vals, 'hubspotUrl'),
            associatedDeal: getValue(vals, 'associatedDeal'),
            associatedDealIds: getValue(vals, 'associatedDealIds'),
            dealRecordId: getValue(vals, 'dealRecordId'),
            dealName: getValue(vals, 'dealName'),
            appInstalled: getValue(vals, 'appInstalled'),
            productOffering: getValue(vals, 'productOffering')
          };
          
          if (booth.companyName) {
            await saveBooth(booth);
            added++;
          }
        }
      }
      
      console.log('Merge complete:', { updated, added, skipped });
      hideMapperModal();
      hideAdminModal();
      alert(`Merge complete!\n\nUpdated: ${updated}\nAdded: ${added}\nSkipped: ${skipped}`);
      
      if (currentShowId === showId) {
        await loadBoothList();
        renderBoothList();
      }
      return;
    }
    
    // REPLACE MODE: Original behavior
    const newBooths = [];
    
    for (const vals of lines) {
      const booth = {
        id: `${showId}_${repId || 'shared'}_${listType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        showId,
        repId,
        listType,
        companyName: getValue(vals, 'companyName'),
        boothNumber: getValue(vals, 'boothNumber'),
        domain: getValue(vals, 'domain'),
        estimatedMonthlySales: getNumeric(vals, 'estimatedMonthlySales'),
        platform: getValue(vals, 'platform'),
        protection: getValue(vals, 'protection'),
        returns: getValue(vals, 'returns'),
        status: STATUS.NOT_VISITED,
        notes: '',
        contactName: '',
        ordersPerMonth: 'N/A',
        aov: 'N/A',
        businessCardData: null,
        // Extended fields
        recordId: getValue(vals, 'recordId'),
        ownerId: getValue(vals, 'ownerId'),
        lastContacted: getValue(vals, 'lastContacted'),
        campaign: getValue(vals, 'campaign'),
        competitorInstalls: getValue(vals, 'competitorInstalls'),
        competitorUninstalls: getValue(vals, 'competitorUninstalls'),
        techInstalls: getValue(vals, 'techInstalls'),
        instagramFollowers: getNumeric(vals, 'instagramFollowers'),
        facebookFollowers: getNumeric(vals, 'facebookFollowers'),
        monthlyVisits: getNumeric(vals, 'monthlyVisits'),
        hubspotUrl: getValue(vals, 'hubspotUrl'),
        associatedDeal: getValue(vals, 'associatedDeal'),
        associatedDealIds: getValue(vals, 'associatedDealIds'),
        dealRecordId: getValue(vals, 'dealRecordId'),
        dealName: getValue(vals, 'dealName'),
        appInstalled: getValue(vals, 'appInstalled'),
        productOffering: getValue(vals, 'productOffering')
      };
      
      if (booth.companyName) newBooths.push(booth);
    }
    
    console.log('Booths to save:', newBooths.length);
    if (newBooths.length === 0) return alert('No valid data found');
    
    console.log('Calling deleteBoothsForList...');
    await deleteBoothsForList(showId, repId, listType);
    
    console.log('Calling saveBooths...');
    await saveBooths(newBooths);
    
    console.log('Import complete');
    hideMapperModal();
    hideAdminModal();
    alert(`Imported ${newBooths.length} records`);
    
    if (currentShowId === showId) {
      await loadBoothList();
      renderBoothList();
    }
  } catch (err) {
    console.error('Import error:', err);
    alert('Import failed: ' + err.message);
  }
}
