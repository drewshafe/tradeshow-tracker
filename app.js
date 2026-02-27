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
  
  // Filter modal
  document.getElementById('filter-btn').addEventListener('click', showFilterModal);
  document.getElementById('close-filter-btn').addEventListener('click', hideFilterModal);
  document.getElementById('clear-filters-btn').addEventListener('click', () => { clearFilters(); hideFilterModal(); });
  document.getElementById('apply-filters-btn').addEventListener('click', () => { applyFilters(); hideFilterModal(); });
  
  // Admin modal
  document.getElementById('close-admin-btn').addEventListener('click', hideAdminModal);
  
  // Mapper modal
  document.getElementById('close-mapper-btn').addEventListener('click', hideMapperModal);
  document.getElementById('cancel-mapper-btn').addEventListener('click', hideMapperModal);
  document.getElementById('confirm-mapper-btn').addEventListener('click', confirmMapping);
  
  // Camera modal
  document.getElementById('close-camera-btn').addEventListener('click', closeCameraModal);
  document.getElementById('capture-btn').addEventListener('click', capturePhoto);
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
  currentRepId = null;
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
    ? `${rep?.name || 'Rep'} - ${listLabel}` : listLabel;
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
    return `<div class="show-card" data-show-id="${show.id}">
      <div class="show-info"><h3>${show.name}</h3><p><i class="fas fa-map-marker-alt"></i> ${show.location || ''} ${dateStr ? `&nbsp; <i class="fas fa-calendar"></i> ${dateStr}` : ''}</p></div>
      <i class="fas fa-chevron-right"></i>
    </div>`;
  }).join('');
  
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
    <button class="tab" data-tab="opps">Current Opps</button>
    <button class="tab" data-tab="dashboard">Dashboard</button>
  `;
  
  container.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'reps') { currentRepId = null; renderRepList(); }
      else if (tab === 'dashboard') { await showDashboard(); }
      else {
        currentListType = tab === 'master' ? LIST_TYPES.MASTER : tab === 'customers' ? LIST_TYPES.CUSTOMERS : LIST_TYPES.CURRENT_OPPS;
        await selectListType(currentListType);
      }
    });
  });
}

function renderRepList() {
  const container = document.getElementById('rep-content');
  container.innerHTML = `<div class="rep-list">${reps.map(rep => `
    <div class="rep-card" data-rep-id="${rep.id}">
      <div class="rep-avatar">${rep.name.charAt(0)}</div>
      <span>${rep.name}</span>
      <i class="fas fa-chevron-right"></i>
    </div>
  `).join('')}</div>`;
  
  container.querySelectorAll('.rep-card').forEach(card => {
    card.addEventListener('click', () => selectRep(card.dataset.repId));
  });
}

// ============ BOOTH LIST ============

async function loadBoothList() {
  booths = await getBooths(currentShowId, currentRepId, currentListType);
  renderBoothList();
}

function getFilteredBooths() {
  let result = [...booths];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(b => (b.companyName || '').toLowerCase().includes(q) || (b.boothNumber || '').toLowerCase().includes(q) || (b.domain || '').toLowerCase().includes(q));
  }
  if (filters.platform !== 'all') {
    result = filters.platform === '[No Platform]' ? result.filter(b => !b.platform) : result.filter(b => b.platform === filters.platform);
  }
  if (filters.protection !== 'all') {
    result = filters.protection === '[No Protection]' ? result.filter(b => !b.protection) : result.filter(b => (b.protection || '').toLowerCase().includes(filters.protection.toLowerCase()));
  }
  if (filters.returns !== 'all') {
    result = filters.returns === '[No Returns]' ? result.filter(b => !b.returns) : result.filter(b => (b.returns || '').toLowerCase().includes(filters.returns.toLowerCase()));
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
  
  document.getElementById('stat-showing').textContent = filtered.length;
  document.getElementById('stat-tovisit').textContent = booths.filter(b => b.status === STATUS.NOT_VISITED).length;
  document.getElementById('stat-followup').textContent = booths.filter(b => b.status === STATUS.FOLLOW_UP).length;
  document.getElementById('stat-demos').textContent = booths.filter(b => b.status === STATUS.DEMO_BOOKED).length;
  renderActiveFilters();

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No booths found</p>${booths.length === 0 ? '<button class="btn primary" id="import-empty-btn">Import Data</button>' : '<button class="btn secondary" id="clear-empty-btn">Clear filters</button>'}</div>`;
    document.getElementById('import-empty-btn')?.addEventListener('click', showAdminModal);
    document.getElementById('clear-empty-btn')?.addEventListener('click', clearFilters);
    return;
  }

  list.innerHTML = filtered.map(b => `
    <div class="booth-item" data-booth-id="${b.id}">
      <div class="booth-left"><div class="status-dot ${b.status || 'not_visited'}"></div><span class="booth-number">${b.boothNumber || '-'}</span></div>
      <div class="booth-center"><div class="company-name">${b.companyName || 'Unknown'}</div><div class="booth-meta">${b.platform || ''}${b.protection ? `<span class="competitor"> • ${b.protection}</span>` : '<span class="no-protection"> • No protection</span>'}</div></div>
      <div class="booth-right"><span class="sales-value">${formatCurrency(b.estimatedMonthlySales)}</span><i class="fas fa-chevron-right"></i></div>
    </div>
  `).join('');
  
  list.querySelectorAll('.booth-item').forEach(item => {
    item.addEventListener('click', () => showDetailView(item.dataset.boothId));
  });
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
  const btn = document.querySelector('.filter-btn');
  let count = 0, chips = [];
  
  if (filters.platform !== 'all') { count++; chips.push({ label: filters.platform, clear: () => { filters.platform = 'all'; renderBoothList(); } }); }
  if (filters.protection !== 'all') { count++; chips.push({ label: filters.protection, clear: () => { filters.protection = 'all'; renderBoothList(); } }); }
  if (filters.returns !== 'all') { count++; chips.push({ label: filters.returns, clear: () => { filters.returns = 'all'; renderBoothList(); } }); }
  if (filters.minRevenue > 0) { count++; chips.push({ label: `≥ ${formatCurrency(filters.minRevenue)}`, clear: () => { filters.minRevenue = 0; renderBoothList(); } }); }
  if (filters.status !== 'all') { count++; chips.push({ label: STATUS_LABELS[filters.status], clear: () => { filters.status = 'all'; renderBoothList(); } }); }

  if (count > 0) {
    container.innerHTML = chips.map((c, i) => `<button class="filter-chip" data-idx="${i}">${c.label} <i class="fas fa-times"></i></button>`).join('') + '<button class="clear-all-btn" id="clear-all-chips">Clear All</button>';
    container.classList.remove('hidden');
    badge.textContent = count; badge.classList.remove('hidden');
    btn.classList.add('active');
    chips.forEach((c, i) => container.querySelector(`[data-idx="${i}"]`).addEventListener('click', c.clear));
    document.getElementById('clear-all-chips').addEventListener('click', clearFilters);
  } else {
    container.classList.add('hidden'); badge.classList.add('hidden'); btn.classList.remove('active');
  }
}

function clearSearch() {
  searchQuery = '';
  document.getElementById('search-input').value = '';
  document.getElementById('clear-search').classList.add('hidden');
  renderBoothList();
}

// ============ DETAIL VIEW ============

function showDetailView(id) {
  currentBoothId = id;
  const booth = booths.find(b => b.id === id);
  if (!booth) return;

  document.getElementById('detail-company').textContent = booth.companyName || 'Unknown';
  const content = document.getElementById('detail-content');
  
  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-row"><span class="booth-badge">Booth ${booth.boothNumber || '-'}</span><span class="detail-sales">${formatCurrency(booth.estimatedMonthlySales)}/mo</span></div>
      <div class="detail-domain">${booth.domain || ''}</div>
      <div class="detail-meta">${booth.platform || 'No platform'}${booth.protection ? `<span class="competitor"> • ${booth.protection}</span>` : '<span class="no-protection"> • No protection</span>'}${booth.returns ? ` • Returns: ${booth.returns}` : ''}</div>
    </div>
    <div class="section">
      <div class="section-title">Status</div>
      <div class="status-buttons">
        ${Object.entries(STATUS).map(([key, val]) => `<button class="status-btn ${val} ${booth.status === val ? 'active' : ''}" data-status="${val}"><i class="fas fa-${val === 'not_visited' ? 'circle' : val === 'follow_up' ? 'clock' : val === 'demo_booked' ? 'calendar' : 'times-circle'}"></i>${STATUS_LABELS[val]}</button>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="section-title">Contact Info</div>
      <input type="text" class="input" id="contact-name" placeholder="Contact name..." value="${booth.contactName || ''}">
      <div class="picker-row">
        <button class="picker-btn" id="orders-picker-btn"><label>Orders/mo</label><span id="orders-value">${booth.ordersPerMonth || 'N/A'}</span><i class="fas fa-chevron-down"></i></button>
        <button class="picker-btn" id="aov-picker-btn"><label>AOV</label><span id="aov-value">${booth.aov || 'N/A'}</span><i class="fas fa-chevron-down"></i></button>
      </div>
      <div id="orders-picker" class="options-list hidden">${ORDER_OPTIONS.map(o => `<div class="option-item ${booth.ordersPerMonth === o ? 'active' : ''}" data-val="${o}">${o}</div>`).join('')}</div>
      <div id="aov-picker" class="options-list hidden">${AOV_OPTIONS.map(o => `<div class="option-item ${booth.aov === o ? 'active' : ''}" data-val="${o}">${o}</div>`).join('')}</div>
    </div>
    <div class="section">
      <div class="section-title">Notes</div>
      <textarea class="input" id="notes-input" placeholder="Tap mic to dictate...">${booth.notes || ''}</textarea>
    </div>
    <div class="section">
      <div class="section-title">Business Card</div>
      <div id="card-container">${booth.businessCardData 
        ? `<div class="card-preview"><img src="${booth.businessCardData}" alt="Card"><div class="card-actions"><button class="card-action" id="retake-btn"><i class="fas fa-camera"></i> Retake</button><button class="card-action danger" id="remove-card-btn"><i class="fas fa-trash"></i> Remove</button></div></div>`
        : '<button class="capture-card-btn" id="capture-card-btn"><i class="fas fa-camera"></i> Capture Business Card</button>'}</div>
    </div>
    <div class="section">
      <div class="section-title">Submit to Slack</div>
      <div class="submit-row"><button class="submit-btn" id="copy-followup-btn"><i class="fas fa-copy"></i> Copy for Follow Up</button><button class="submit-btn demo" id="copy-demo-btn"><i class="fas fa-calendar"></i> Copy for Demo</button></div>
      <button class="slack-btn" id="open-slack-btn"><i class="fab fa-slack"></i> Open Slack Workflow <i class="fas fa-external-link-alt" style="font-size:12px;opacity:0.6"></i></button>
    </div>
  `;

  // Attach event listeners
  content.querySelectorAll('.status-btn').forEach(btn => btn.addEventListener('click', () => setStatus(btn.dataset.status)));
  content.querySelector('#contact-name').addEventListener('change', (e) => updateBoothField('contactName', e.target.value));
  content.querySelector('#notes-input').addEventListener('change', (e) => updateBoothField('notes', e.target.value));
  content.querySelector('#orders-picker-btn').addEventListener('click', () => togglePicker('orders'));
  content.querySelector('#aov-picker-btn').addEventListener('click', () => togglePicker('aov'));
  content.querySelectorAll('#orders-picker .option-item').forEach(opt => opt.addEventListener('click', () => selectOption('ordersPerMonth', opt.dataset.val, 'orders')));
  content.querySelectorAll('#aov-picker .option-item').forEach(opt => opt.addEventListener('click', () => selectOption('aov', opt.dataset.val, 'aov')));
  content.querySelector('#capture-card-btn, #retake-btn')?.addEventListener('click', openCamera);
  content.querySelector('#remove-card-btn')?.addEventListener('click', removeCard);
  content.querySelector('#copy-followup-btn').addEventListener('click', copyForFollowUp);
  content.querySelector('#copy-demo-btn').addEventListener('click', copyForDemo);
  content.querySelector('#open-slack-btn').addEventListener('click', openSlack);

  hideAllViews();
  document.getElementById('detail-view').classList.add('active');
}

async function setStatus(status) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) { booth.status = status; await saveBooth(booth); showDetailView(currentBoothId); }
}

async function updateBoothField(field, value) {
  const booth = booths.find(b => b.id === currentBoothId);
  if (booth) { booth[field] = value; await saveBooth(booth); }
}

function togglePicker(type) {
  document.getElementById(`${type}-picker`).classList.toggle('hidden');
  document.getElementById(type === 'orders' ? 'aov-picker' : 'orders-picker').classList.add('hidden');
}

async function selectOption(field, value, pickerType) {
  await updateBoothField(field, value);
  document.getElementById(`${pickerType}-value`).textContent = value;
  document.getElementById(`${pickerType}-picker`).classList.add('hidden');
}

function copyForFollowUp() {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  navigator.clipboard.writeText([booth.companyName, booth.ordersPerMonth || 'N/A', booth.aov || 'N/A', booth.notes].filter(Boolean).join('\n'));
  if (booth.status === STATUS.NOT_VISITED) setStatus(STATUS.FOLLOW_UP);
  alert('Copied for Follow Up workflow');
}

function copyForDemo() {
  const booth = booths.find(b => b.id === currentBoothId);
  if (!booth) return;
  navigator.clipboard.writeText([booth.companyName, booth.ordersPerMonth || 'N/A', booth.aov || 'N/A', booth.notes].filter(Boolean).join('\n'));
  setStatus(STATUS.DEMO_BOOKED);
  alert('Copied for Demo workflow');
}

function openSlack() { window.location.href = 'slack://channel?team=T05MZUWTJPX&id=C05NH7DQB4K'; }

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
  await updateBoothField('businessCardData', canvas.toDataURL('image/jpeg', 0.7));
  closeCameraModal();
  showDetailView(currentBoothId);
}

async function removeCard() { await updateBoothField('businessCardData', null); showDetailView(currentBoothId); }

// ============ FILTERS ============

function showFilterModal() { tempFilters = { ...filters }; renderFilterOptions(); document.getElementById('filter-modal').classList.remove('hidden'); }
function hideFilterModal() { document.getElementById('filter-modal').classList.add('hidden'); }

function renderFilterOptions() {
  const container = document.getElementById('filter-options');
  container.innerHTML = `
    <div class="filter-section"><div class="filter-section-title">Platform</div><div class="filter-options" id="platform-options"></div></div>
    <div class="filter-section"><div class="filter-section-title">Protection</div><div class="filter-options" id="protection-options"></div></div>
    <div class="filter-section"><div class="filter-section-title">Returns</div><div class="filter-options" id="returns-options"></div></div>
    <div class="filter-section"><div class="filter-section-title">Min Revenue</div><div class="filter-options" id="revenue-options"></div></div>
    <div class="filter-section"><div class="filter-section-title">Status</div><div class="filter-options" id="status-options"></div></div>
  `;
  
  const addOptions = (containerId, options, filterKey, allLabel = 'All') => {
    const c = document.getElementById(containerId);
    c.innerHTML = `<button class="filter-option ${tempFilters[filterKey] === 'all' ? 'active' : ''}" data-val="all">${allLabel}</button>` +
      options.map(o => `<button class="filter-option ${tempFilters[filterKey] === o ? 'active' : ''}" data-val="${o}">${typeof o === 'number' ? (o === 0 ? 'Any' : '≥ ' + formatCurrency(o)) : o}</button>`).join('');
    c.querySelectorAll('.filter-option').forEach(btn => btn.addEventListener('click', () => {
      tempFilters[filterKey] = btn.dataset.val === 'all' ? 'all' : (typeof options[0] === 'number' ? parseInt(btn.dataset.val) : btn.dataset.val);
      renderFilterOptions();
    }));
  };
  
  addOptions('platform-options', PLATFORMS, 'platform');
  addOptions('protection-options', PROTECTION_PROVIDERS, 'protection');
  addOptions('returns-options', RETURNS_PROVIDERS, 'returns');
  addOptions('revenue-options', REVENUE_THRESHOLDS, 'minRevenue');
  
  const statusC = document.getElementById('status-options');
  statusC.innerHTML = `<button class="filter-option ${tempFilters.status === 'all' ? 'active' : ''}" data-val="all">All</button>` +
    Object.entries(STATUS).map(([k, v]) => `<button class="filter-option ${tempFilters.status === v ? 'active' : ''}" data-val="${v}">${STATUS_LABELS[v]}</button>`).join('');
  statusC.querySelectorAll('.filter-option').forEach(btn => btn.addEventListener('click', () => { tempFilters.status = btn.dataset.val; renderFilterOptions(); }));
}

function applyFilters() { filters = { ...tempFilters }; renderBoothList(); }
function clearFilters() { filters = { platform: 'all', protection: 'all', returns: 'all', minRevenue: 0, status: 'all' }; tempFilters = { ...filters }; renderBoothList(); }

// ============ DASHBOARD ============

async function renderDashboard() {
  const stats = await getDashboardStats(currentShowId);
  const container = document.getElementById('dashboard-content');
  const totals = stats.reduce((acc, s) => ({ toVisit: acc.toVisit + s.toVisit, followUp: acc.followUp + s.followUp, demos: acc.demos + s.demos, dq: acc.dq + s.dq, total: acc.total + s.total }), { toVisit: 0, followUp: 0, demos: 0, dq: 0, total: 0 });

  container.innerHTML = `
    <div class="dashboard-totals">
      <div class="total-card"><span class="total-value">${totals.total}</span><label>Total</label></div>
      <div class="total-card red"><span class="total-value">${totals.toVisit}</span><label>To Visit</label></div>
      <div class="total-card yellow"><span class="total-value">${totals.followUp}</span><label>Follow Up</label></div>
      <div class="total-card green"><span class="total-value">${totals.demos}</span><label>Demos</label></div>
    </div>
    <div class="section-title" style="padding:16px 16px 8px">Rep Rankings</div>
    <div class="leaderboard">${stats.map((s, i) => `
      <div class="leaderboard-row"><span class="rank">${i + 1}</span><span class="rep-name">${s.repName}</span>
        <div class="rep-stats"><span class="stat-pill green">${s.demos} demos</span><span class="stat-pill yellow">${s.followUp} follow</span><span class="stat-pill red">${s.toVisit} left</span></div>
      </div>`).join('')}
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

function showAdminModal() { document.getElementById('admin-modal').classList.remove('hidden'); renderAdminTabs(); showAdminTab('shows'); }
function hideAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

function renderAdminTabs() {
  const container = document.getElementById('admin-tabs');
  container.innerHTML = `<button class="admin-tab active" data-tab="shows">Shows</button><button class="admin-tab" data-tab="reps">Reps</button><button class="admin-tab" data-tab="import">Import</button>`;
  container.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => {
    container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    showAdminTab(btn.dataset.tab);
  }));
}

function showAdminTab(tab) {
  const content = document.getElementById('admin-content');
  
  if (tab === 'shows') {
    content.innerHTML = `<div class="admin-list">${shows.map(s => `<div class="admin-item"><span>${s.name}</span><span class="muted">${s.location || ''}</span></div>`).join('')}</div><button class="btn primary full" id="add-show-btn"><i class="fas fa-plus"></i> Add Show</button>`;
    document.getElementById('add-show-btn').addEventListener('click', addShowPrompt);
  } else if (tab === 'reps') {
    content.innerHTML = `<div class="admin-list">${reps.map(r => `<div class="admin-item"><span>${r.name}</span></div>`).join('')}</div><button class="btn primary full" id="add-rep-btn"><i class="fas fa-plus"></i> Add Rep</button>`;
    document.getElementById('add-rep-btn').addEventListener('click', addRepPrompt);
  } else if (tab === 'import') {
    content.innerHTML = `
      <div class="import-section">
        <label>Select Show</label><select id="import-show" class="input">${shows.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        <label>Select Rep (for Hit List)</label><select id="import-rep" class="input"><option value="">-- None (Master/Customers/Opps) --</option>${reps.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
        <label>List Type</label><select id="import-list-type" class="input"><option value="${LIST_TYPES.HIT_LIST}">Hit List</option><option value="${LIST_TYPES.MASTER}">Master</option><option value="${LIST_TYPES.CUSTOMERS}">Customers</option><option value="${LIST_TYPES.CURRENT_OPPS}">Current Opps</option></select>
        <label>Google Sheet URL</label><input type="url" id="import-url" class="input" placeholder="https://docs.google.com/spreadsheets/d/...">
        <button class="btn primary full" id="import-sheet-btn"><i class="fas fa-cloud-download-alt"></i> Import from Sheet</button>
        <div class="divider">OR</div>
        <label>Paste Data (Tab-delimited)</label><textarea id="import-paste" class="input" rows="6" placeholder="Paste from Google Sheets..."></textarea>
        <button class="btn primary full" id="import-paste-btn"><i class="fas fa-paste"></i> Import Pasted Data</button>
      </div>`;
    document.getElementById('import-sheet-btn').addEventListener('click', importFromSheet);
    document.getElementById('import-paste-btn').addEventListener('click', importFromPaste);
  }
}

async function addShowPrompt() {
  const name = prompt('Show name:'); if (!name) return;
  const location = prompt('Location:') || '';
  await saveShow({ id: name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(), name, location, startDate: '', endDate: '', website: '', exhibitorList: '' });
  shows = await getShows();
  showAdminTab('shows');
}

async function addRepPrompt() {
  const name = prompt('Rep name:'); if (!name) return;
  await saveRep({ id: name.toLowerCase().replace(/\s+/g, '_'), name });
  reps = await getReps();
  showAdminTab('reps');
}

// ============ IMPORT ============

async function importFromSheet() {
  const url = document.getElementById('import-url').value.trim();
  if (!url) return alert('Enter a Google Sheet URL');
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return alert('Invalid Google Sheets URL');
  try {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=tsv`);
    if (!response.ok) throw new Error('Could not fetch sheet');
    processImportData(await response.text());
  } catch (err) { alert('Import failed: ' + err.message); }
}

function importFromPaste() {
  const text = document.getElementById('import-paste').value.trim();
  if (!text) return alert('Paste data first');
  processImportData(text);
}

function processImportData(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return alert('No data found');
  pendingImportData = { headers: lines[0].split('\t').map(h => h.trim()), lines: lines.slice(1) };
  showMapperModal();
}

function showMapperModal() {
  const { headers } = pendingImportData;
  columnMapping = {};
  const headerLower = headers.map(h => h.toLowerCase());
  const patterns = {
    companyName: ['company name', 'company', 'name', 'merchant'],
    boothNumber: ['booth', 'booth#', 'booth number'],
    domain: ['domain', 'website', 'url', 'company domain'],
    estimatedMonthlySales: ['est monthly sales', 'estimated monthly sales', 'monthly sales', 'revenue'],
    platform: ['platform', 'ecommerce platform'],
    protection: ['protection', 'competitor', 'shipping protection'],
    returns: ['returns', 'return provider']
  };
  REQUIRED_FIELDS.forEach(field => {
    const found = headerLower.findIndex(h => patterns[field.key]?.some(p => h.includes(p)));
    if (found >= 0) columnMapping[field.key] = found;
  });
  renderMapperContent();
  document.getElementById('mapper-modal').classList.remove('hidden');
}

function renderMapperContent() {
  const { headers } = pendingImportData;
  const content = document.getElementById('mapper-content');
  content.innerHTML = `<p class="hint">Map your columns to the required fields:</p><div class="mapper-grid">${REQUIRED_FIELDS.map(field => `
    <div class="mapper-row"><label>${field.label}${field.required ? ' *' : ''}</label>
      <select class="input" data-field="${field.key}"><option value="">-- Skip --</option>${headers.map((h, i) => `<option value="${i}" ${columnMapping[field.key] === i ? 'selected' : ''}>${h}</option>`).join('')}</select>
    </div>`).join('')}</div>`;
  content.querySelectorAll('select').forEach(sel => sel.addEventListener('change', () => {
    columnMapping[sel.dataset.field] = sel.value === '' ? undefined : parseInt(sel.value);
  }));
}

function hideMapperModal() { document.getElementById('mapper-modal').classList.add('hidden'); pendingImportData = null; }

async function confirmMapping() {
  if (columnMapping.companyName === undefined) return alert('Company Name is required');
  const showId = document.getElementById('import-show').value;
  const repId = document.getElementById('import-rep').value || null;
  const listType = document.getElementById('import-list-type').value;
  const { lines } = pendingImportData;
  const newBooths = [];
  
  for (const line of lines) {
    const vals = line.split('\t');
    const booth = {
      id: `${showId}_${repId || 'shared'}_${listType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      showId, repId, listType,
      companyName: vals[columnMapping.companyName] || '',
      boothNumber: columnMapping.boothNumber !== undefined ? vals[columnMapping.boothNumber] : '',
      domain: columnMapping.domain !== undefined ? vals[columnMapping.domain] : '',
      estimatedMonthlySales: columnMapping.estimatedMonthlySales !== undefined ? parseFloat((vals[columnMapping.estimatedMonthlySales] || '0').replace(/[$,]/g, '')) || 0 : 0,
      platform: columnMapping.platform !== undefined ? vals[columnMapping.platform] : '',
      protection: columnMapping.protection !== undefined ? vals[columnMapping.protection] : '',
      returns: columnMapping.returns !== undefined ? vals[columnMapping.returns] : '',
      status: STATUS.NOT_VISITED, notes: '', contactName: '', ordersPerMonth: 'N/A', aov: 'N/A', businessCardData: null
    };
    if (booth.companyName) newBooths.push(booth);
  }
  
  if (newBooths.length === 0) return alert('No valid data found');
  await deleteBoothsForList(showId, repId, listType);
  await saveBooths(newBooths);
  hideMapperModal();
  hideAdminModal();
  alert(`Imported ${newBooths.length} records`);
  if (currentShowId === showId) { await loadBoothList(); renderBoothList(); }
}
