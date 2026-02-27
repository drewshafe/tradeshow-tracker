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
let filters = { platform: 'all', protection: 'all', returns: 'all', minRevenue: 0, status: 'all' };
let tempFilters = { ...filters };
let pendingImportData = null;
let columnMapping = {};
let cameraStream = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Initializing...');
    await initDB();
    console.log('DB initialized');
    await loadShows();
    console.log('Shows loaded:', shows.length);
    setupEventListeners();
    console.log('Ready');
  } catch (e) {
    console.error('Init error:', e);
  }
});

function setupEventListeners() {
  // Navigation buttons
  document.getElementById('admin-btn').addEventListener('click', showAdminModal);
  document.getElementById('back-to-shows-btn').addEventListener('click', goToShows);
  document.getElementById('back-to-reps-btn').addEventListener('click', goToRepSelect);
  document.getElementById('back-to-list-btn').addEventListener('click', showListView);
  document.getElementById('back-from-dashboard-btn').addEventListener('click', goToRepSelect);
  document.getElementById('export-btn').addEventListener('click', exportDashboard);
  
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
      renderBoothList();
    });
  });
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
  await loadBoothList();
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
  updateListTitle();
}

async function selectListType(listType) {
  currentListType = listType;
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
  hideAllViews();
  document.getElementById('list-view').classList.add('active');
}

function hideAllViews() {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
}

function updateListTitle() {
  const rep = reps.find(r => r.id === currentRepId);
  const listLabel = LIST_LABELS[currentListType] || currentListType;
  document.getElementById('list-title').textContent = currentRepId 
    ? `${rep?.name || 'Rep'} - ${listLabel}`
    : listLabel;
}

// ============ SHOW LIST ============

function renderShowList() {
  const container = document.getElementById('show-list');
  
  if (shows.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No shows configured</p><button class="btn primary" id="add-show-empty-btn">Add Show</button></div>';
    document.getElementById('add-show-empty-btn')?.addEventListener('click', showAdminModal);
    return;
  }
  
  container.innerHTML = shows.map(show => {
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
  
  // Attach click handlers
  container.querySelectorAll('.show-card').forEach(card => {
    card.addEventListener('click', () => selectShow(card.dataset.showId));
  });
}

// ============ REP SELECT / TABS ============

function renderShowTabs() {
  const container = document.getElementById('show-tabs');
  container.innerHTML = `
    <button class="tab active" data-tab="reps">Reps</button>
    <button class="tab" data-tab="master">Master</button>
    <button class="tab" data-tab="customers">Customers</button>
    <button class="tab" data-tab="working">Working</button>
    <button class="tab" data-tab="opps">Opps</button>
    <button class="tab" data-tab="inactive">Inactive</button>
    <button class="tab" data-tab="people">People</button>
    <button class="tab" data-tab="dashboard">Dashboard</button>
  `;
  
  container.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      
      if (tab === 'reps') {
        currentRepId = null;
        renderRepList();
      } else if (tab === 'dashboard') {
        await showDashboard();
      } else if (tab === 'people') {
        currentRepId = null;
        currentListType = LIST_TYPES.PEOPLE;
        await loadPeopleList();
        hideAllViews();
        document.getElementById('list-view').classList.add('active');
        updateListTitle();
      } else {
        currentRepId = null;
        const typeMap = {
          'master': LIST_TYPES.MASTER,
          'customers': LIST_TYPES.CUSTOMERS,
          'working': LIST_TYPES.WORKING,
          'opps': LIST_TYPES.OPPS,
          'inactive': LIST_TYPES.INACTIVE_CUSTOMERS
        };
        currentListType = typeMap[tab];
        await loadBoothList();
        hideAllViews();
        document.getElementById('list-view').classList.add('active');
        updateListTitle();
      }
    });
  });
}

function renderRepList() {
  const container = document.getElementById('rep-content');
  
  container.innerHTML = `
    <div class="rep-list">
      ${reps.map(rep => `
        <div class="rep-card" data-rep-id="${rep.id}">
          <div class="rep-avatar">${rep.name.charAt(0)}</div>
          <span>${rep.name}</span>
          <i class="fas fa-chevron-right"></i>
        </div>
      `).join('')}
    </div>
  `;
  
  container.querySelectorAll('.rep-card').forEach(card => {
    card.addEventListener('click', () => selectRep(card.dataset.repId));
  });
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

  if (filters.platform !== 'all') {
    if (filters.platform === '[No Platform]') result = result.filter(b => !b.platform);
    else result = result.filter(b => b.platform === filters.platform);
  }

  if (filters.protection !== 'all') {
    if (filters.protection === '[No Protection]') result = result.filter(b => !b.protection);
    else result = result.filter(b => (b.protection || '').toLowerCase().includes(filters.protection.toLowerCase()));
  }

  if (filters.returns !== 'all') {
    if (filters.returns === '[No Returns]') result = result.filter(b => !b.returns);
    else result = result.filter(b => (b.returns || '').toLowerCase().includes(filters.returns.toLowerCase()));
  }

  if (filters.minRevenue > 0) result = result.filter(b => (b.estimatedMonthlySales || 0) >= filters.minRevenue);
  if (filters.status !== 'all') result = result.filter(b => b.status === filters.status);

  switch (sortBy) {
    case 'booth': result.sort((a, b) => (parseInt(a.boothNumber) || 99999) - (parseInt(b.boothNumber) || 99999)); break;
    case 'value': result.sort((a, b) => (b.estimatedMonthlySales || 0) - (a.estimatedMonthlySales || 0)); break;
    case 'name': result.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || '')); break;
  }
  return result;
}

function renderBoothList() {
  const filtered = getFilteredBooths();
  const list = document.getElementById('booth-list');
  const config = LIST_CONFIG[currentListType] || {};
  
  document.getElementById('stat-showing').textContent = filtered.length;
  document.getElementById('stat-tovisit').textContent = booths.filter(b => b.status === STATUS.NOT_VISITED || !b.status).length;
  document.getElementById('stat-followup').textContent = booths.filter(b => b.status === STATUS.FOLLOW_UP).length;
  document.getElementById('stat-demos').textContent = booths.filter(b => b.status === STATUS.DEMO_BOOKED).length;

  renderActiveFilters();

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No booths found</p>${booths.length === 0 ? '<button class="btn primary" id="import-empty-btn">Import Data</button>' : '<button class="btn secondary" id="clear-filters-empty-btn">Clear filters</button>'}</div>`;
    document.getElementById('import-empty-btn')?.addEventListener('click', showAdminModal);
    document.getElementById('clear-filters-empty-btn')?.addEventListener('click', clearFilters);
    return;
  }

  // Grid view for Master, Customer, Working, Opps, People
  if (config.isGrid) {
    list.innerHTML = `
      <div class="grid-view">
        <div class="grid-header">
          <span>Booth</span>
          <span>Company</span>
          <span>Sales</span>
          <span>Platform</span>
          ${config.showRep ? '<span>Owner</span>' : ''}
        </div>
        ${filtered.map(b => `
          <div class="grid-row">
            <span class="booth-num">${b.boothNumber || '-'}</span>
            <span class="primary">${b.companyName || 'Unknown'}</span>
            <span class="sales">${formatCurrency(b.estimatedMonthlySales)}</span>
            <span>${b.platform || ''}</span>
            ${config.showRep ? `<span class="owner">${getOwnerName(b.ownerId)}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  // Detail view for Hit List and Inactive Customers
  list.innerHTML = filtered.map(b => {
    const tag = b.tag ? `<span class="item-tag ${b.tag.toLowerCase()}">${b.tag}</span>` : '';
    const claimedTag = b.claimedBy ? `<span class="item-tag claimed">Claimed: ${reps.find(r => r.id === b.claimedBy)?.name || b.claimedBy}</span>` : '';
    const ownerDisplay = config.showRep && b.ownerId ? `<span class="owner-badge">${getOwnerName(b.ownerId)}</span>` : '';
    
    return `
    <div class="booth-item ${config.hasDetail ? '' : 'no-click'}" data-booth-id="${b.id}">
      <div class="booth-left">
        <div class="status-dot ${b.status || 'not_visited'}"></div>
        <span class="booth-number">${b.boothNumber || '-'}</span>
      </div>
      <div class="booth-center">
        <div class="company-row">
          <span class="company-name">${b.companyName || 'Unknown'}</span>
          ${tag}${claimedTag}
        </div>
        <div class="booth-meta">
          ${b.platform || ''}
          ${b.protection ? `<span class="competitor"> • ${b.protection}</span>` : '<span class="no-protection"> • No protection</span>'}
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

  if (filters.platform !== 'all') { count++; chips.push({ key: 'platform', label: filters.platform }); }
  if (filters.protection !== 'all') { count++; chips.push({ key: 'protection', label: filters.protection }); }
  if (filters.returns !== 'all') { count++; chips.push({ key: 'returns', label: filters.returns }); }
  if (filters.minRevenue > 0) { count++; chips.push({ key: 'minRevenue', label: `≥ ${formatCurrency(filters.minRevenue)}` }); }
  if (filters.status !== 'all') { count++; chips.push({ key: 'status', label: STATUS_LABELS[filters.status] }); }

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
        else filters[key] = 'all';
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
  currentBoothId = id;
  const booth = booths.find(b => b.id === id);
  if (!booth) return;

  // Get people for this company domain
  const companyPeople = booth.domain ? await getPeopleByDomain(currentShowId, booth.domain) : [];

  document.getElementById('detail-company').textContent = booth.companyName || 'Unknown';
  
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-row">
        <span class="booth-badge">Booth ${booth.boothNumber || '-'}</span>
        <span class="detail-sales">${formatCurrency(booth.estimatedMonthlySales)}/mo</span>
      </div>
      <div class="detail-domain">${booth.domain || ''}</div>
      <div class="detail-meta">
        ${booth.platform || 'No platform'}
        ${booth.protection ? `<span class="competitor"> • ${booth.protection}</span>` : '<span class="no-protection"> • No protection</span>'}
        ${booth.returns ? ` • Returns: ${booth.returns}` : ''}
      </div>
      ${booth.tag ? `<span class="detail-tag ${booth.tag.toLowerCase()}">${booth.tag}</span>` : ''}
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
            <i class="fas fa-${val === 'not_visited' ? 'circle' : val === 'follow_up' ? 'clock' : val === 'demo_booked' ? 'calendar' : 'times-circle'}"></i>
            ${STATUS_LABELS[val]}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Contact Info</div>
      <input type="text" class="input" id="contact-name" placeholder="Contact name..." value="${booth.contactName || ''}">
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
          ? `<div class="card-preview"><img src="${booth.businessCardData}" alt="Card"><div class="card-actions"><button class="card-action" id="retake-card-btn"><i class="fas fa-camera"></i> Retake</button><button class="card-action danger" id="remove-card-btn"><i class="fas fa-trash"></i> Remove</button></div></div>`
          : `<button class="capture-card-btn" id="capture-card-btn"><i class="fas fa-camera"></i> Capture Business Card</button>`}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Submit to Slack</div>
      <div class="submit-row">
        <button class="submit-btn" id="copy-followup-btn"><i class="fas fa-copy"></i> Copy for Follow Up</button>
        <button class="submit-btn demo" id="copy-demo-btn"><i class="fas fa-calendar"></i> Copy for Demo</button>
      </div>
      <button class="slack-btn" id="open-slack-btn"><i class="fab fa-slack"></i> Open Slack Workflow <i class="fas fa-external-link-alt" style="font-size:12px;opacity:0.6"></i></button>
    </div>
  `;

  // Attach event listeners
  content.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.status));
  });
  
  document.getElementById('contact-name').addEventListener('change', (e) => updateBoothField('contactName', e.target.value));
  document.getElementById('notes-input').addEventListener('change', (e) => updateBoothField('notes', e.target.value));
  
  document.getElementById('orders-picker-btn').addEventListener('click', () => togglePicker('orders'));
  document.getElementById('aov-picker-btn').addEventListener('click', () => togglePicker('aov'));
  
  content.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', () => selectOption(item.dataset.field, item.dataset.value));
  });
  
  document.getElementById('capture-card-btn')?.addEventListener('click', openCamera);
  document.getElementById('retake-card-btn')?.addEventListener('click', openCamera);
  document.getElementById('remove-card-btn')?.addEventListener('click', removeCard);
  
  document.getElementById('copy-followup-btn').addEventListener('click', copyForFollowUp);
  document.getElementById('copy-demo-btn').addEventListener('click', copyForDemo);
  document.getElementById('open-slack-btn').addEventListener('click', openSlack);

  hideAllViews();
  document.getElementById('detail-view').classList.add('active');
}

async function setStatus(status) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) {
    booth.status = status;
    await saveBooth(booth);
    showDetailView(currentBoothId);
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
  if (booth.status === STATUS.NOT_VISITED) setStatus(STATUS.FOLLOW_UP);
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

function openSlack() {
  window.location.href = 'slack://channel?team=T05MZUWTJPX&id=C05NH7DQB4K';
}

// Camera
async function openCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    document.getElementById('camera-video').srcObject = cameraStream;
    document.getElementById('camera-modal').classList.remove('hidden');
  } catch (err) { alert('Camera access denied'); }
}

function closeCameraModal() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('camera-modal').classList.add('hidden');
}

async function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  await updateBoothField('businessCardData', dataUrl);
  closeCameraModal();
  showDetailView(currentBoothId);
}

async function removeCard() {
  await updateBoothField('businessCardData', null);
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
  container.innerHTML = `
    <div class="filter-section">
      <div class="filter-section-title">Platform</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.platform === 'all' ? 'active' : ''}" data-filter="platform" data-value="all">All</button>
        ${PLATFORMS.map(p => `<button class="filter-option ${tempFilters.platform === p ? 'active' : ''}" data-filter="platform" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Protection</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.protection === 'all' ? 'active' : ''}" data-filter="protection" data-value="all">All</button>
        ${PROTECTION_PROVIDERS.map(p => `<button class="filter-option ${tempFilters.protection === p ? 'active' : ''}" data-filter="protection" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Returns</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.returns === 'all' ? 'active' : ''}" data-filter="returns" data-value="all">All</button>
        ${RETURNS_PROVIDERS.map(p => `<button class="filter-option ${tempFilters.returns === p ? 'active' : ''}" data-filter="returns" data-value="${p}">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Min Revenue</div>
      <div class="filter-options">
        ${REVENUE_THRESHOLDS.map(t => `<button class="filter-option ${tempFilters.minRevenue === t ? 'active' : ''}" data-filter="minRevenue" data-value="${t}">${t === 0 ? 'Any' : '≥ ' + formatCurrency(t)}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Status</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.status === 'all' ? 'active' : ''}" data-filter="status" data-value="all">All</button>
        ${Object.entries(STATUS).map(([k, v]) => `<button class="filter-option ${tempFilters.status === v ? 'active' : ''}" data-filter="status" data-value="${v}">${STATUS_LABELS[v]}</button>`).join('')}
      </div>
    </div>
  `;
  
  container.querySelectorAll('.filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter;
      const value = btn.dataset.value;
      tempFilters[key] = key === 'minRevenue' ? parseInt(value) : value;
      renderFilterOptions();
    });
  });
}

function applyFilters() { filters = { ...tempFilters }; hideFilterModal(); renderBoothList(); }
function clearFilters() { filters = { platform: 'all', protection: 'all', returns: 'all', minRevenue: 0, status: 'all' }; tempFilters = { ...filters }; hideFilterModal(); renderBoothList(); }

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
  const stats = await getDashboardStats(currentShowId);
  const container = document.getElementById('dashboard-content');
  
  const totals = stats.reduce((acc, s) => ({
    toVisit: acc.toVisit + s.toVisit, followUp: acc.followUp + s.followUp,
    demos: acc.demos + s.demos, dq: acc.dq + s.dq, total: acc.total + s.total
  }), { toVisit: 0, followUp: 0, demos: 0, dq: 0, total: 0 });

  container.innerHTML = `
    <div class="dashboard-totals">
      <div class="total-card"><span class="total-value">${totals.total}</span><label>Total</label></div>
      <div class="total-card red"><span class="total-value">${totals.toVisit}</span><label>To Visit</label></div>
      <div class="total-card yellow"><span class="total-value">${totals.followUp}</span><label>Follow Up</label></div>
      <div class="total-card green"><span class="total-value">${totals.demos}</span><label>Demos</label></div>
    </div>
    <div class="section-title" style="padding:16px 16px 8px">Rep Rankings</div>
    <div class="leaderboard">
      ${stats.map((s, i) => `
        <div class="leaderboard-row">
          <span class="rank">${i + 1}</span>
          <span class="rep-name">${s.repName}</span>
          <div class="rep-stats">
            <span class="stat-pill green">${s.demos} demos</span>
            <span class="stat-pill yellow">${s.followUp} follow</span>
            <span class="stat-pill red">${s.toVisit} left</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
  showAdminTab('shows'); 
}
function hideAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

function renderAdminTabs() {
  const container = document.getElementById('admin-tabs');
  container.innerHTML = `
    <button class="admin-tab active" data-tab="shows">Shows</button>
    <button class="admin-tab" data-tab="reps">Reps</button>
    <button class="admin-tab" data-tab="import">Import</button>
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
  
  if (tab === 'shows') {
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
        <select id="import-show" class="input">${shows.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        
        <label>List Type</label>
        <select id="import-list-type" class="input">
          <option value="${LIST_TYPES.HIT_LIST}">Hit List</option>
          <option value="${LIST_TYPES.MASTER}">Master</option>
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
  }
}

async function addShowPrompt() {
  const name = prompt('Show name:'); if (!name) return;
  const location = prompt('Location:') || '';
  const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
  await saveShow({ id, name, location, startDate: '', endDate: '', website: '', exhibitorList: '' });
  shows = await getShows();
  showAdminTab('shows');
  renderShowList();
}

async function addRepPrompt() {
  const name = prompt('Rep name:'); if (!name) return;
  const id = name.toLowerCase().replace(/\s+/g, '_');
  await saveRep({ id, name });
  reps = await getReps();
  showAdminTab('reps');
}

// ============ IMPORT ============

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
      };
      
      const patterns = variations[field.key] || [];
      found = headerLower.findIndex(h => patterns.some(p => h.includes(p) || p.includes(h)));
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
  const listType = document.getElementById('import-list-type').value;
  const fields = CSV_FIELDS[listType] || CSV_FIELDS[LIST_TYPES.HIT_LIST];
  
  // Check required fields
  const requiredFields = fields.filter(f => f.required);
  for (const field of requiredFields) {
    if (columnMapping[field.key] === undefined) {
      return alert(`${field.label} is required`);
    }
  }
  
  const showId = document.getElementById('import-show').value;
  const repId = listType === LIST_TYPES.HIT_LIST ? (document.getElementById('import-rep').value || null) : null;
  
  const { lines } = pendingImportData;
  
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
  const newBooths = [];
  
  for (const vals of lines) {
    const getValue = (key) => columnMapping[key] !== undefined ? (vals[columnMapping[key]] || '') : '';
    const getNumeric = (key) => {
      const val = getValue(key);
      return parseFloat(String(val).replace(/[$,]/g, '')) || 0;
    };
    
    const booth = {
      id: `${showId}_${repId || 'shared'}_${listType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      showId,
      repId,
      listType,
      companyName: getValue('companyName'),
      boothNumber: getValue('boothNumber'),
      domain: getValue('domain'),
      estimatedMonthlySales: getNumeric('estimatedMonthlySales'),
      platform: getValue('platform'),
      protection: getValue('protection'),
      returns: getValue('returns'),
      status: STATUS.NOT_VISITED,
      notes: '',
      contactName: '',
      ordersPerMonth: 'N/A',
      aov: 'N/A',
      businessCardData: null,
      // Extended fields
      recordId: getValue('recordId'),
      ownerId: getValue('ownerId'),
      lastContacted: getValue('lastContacted'),
      campaign: getValue('campaign'),
      competitorInstalls: getValue('competitorInstalls'),
      competitorUninstalls: getValue('competitorUninstalls'),
      techInstalls: getValue('techInstalls'),
      instagramFollowers: getNumeric('instagramFollowers'),
      facebookFollowers: getNumeric('facebookFollowers'),
      monthlyVisits: getNumeric('monthlyVisits'),
      associatedDeal: getValue('associatedDeal'),
      associatedDealIds: getValue('associatedDealIds'),
      dealRecordId: getValue('dealRecordId'),
      dealName: getValue('dealName')
    };
    
    if (booth.companyName) newBooths.push(booth);
  }
  
  if (newBooths.length === 0) return alert('No valid data found');
  
  await deleteBoothsForList(showId, repId, listType);
  await saveBooths(newBooths);
  
  hideMapperModal();
  hideAdminModal();
  alert(`Imported ${newBooths.length} records`);
  
  if (currentShowId === showId) {
    await loadBoothList();
    renderBoothList();
  }
}
