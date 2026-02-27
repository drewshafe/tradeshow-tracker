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
    console.log('Reps loaded:', reps.length);
    setupEventListeners();
    console.log('Ready');
  } catch (e) {
    console.error('Init error:', e);
    alert('Error: ' + e.message);
  }
});

function setupEventListeners() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    document.getElementById('clear-search').classList.toggle('hidden', !searchQuery);
    renderBoothList();
  });

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
  const rep = reps.find(r => r.id === repId);
  document.getElementById('list-title').textContent = `${rep?.name || 'Rep'} - Hit List`;
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
  console.log('renderShowList called, shows:', shows);
  const container = document.getElementById('show-list');
  
  if (!container) {
    console.error('show-list container not found!');
    return;
  }
  
  if (shows.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-alt"></i><p>No shows configured</p><button onclick="showAdminModal()">Add Show</button></div>`;
    return;
  }
  
  container.innerHTML = shows.map(show => {
    const startDate = show.startDate ? new Date(show.startDate) : null;
    const endDate = show.endDate ? new Date(show.endDate) : null;
    const dateStr = startDate && endDate 
      ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : '';
    
    return `
      <div class="show-card" onclick="selectShow('${show.id}')">
        <div class="show-info">
          <h3>${show.name}</h3>
          <p><i class="fas fa-map-marker-alt"></i> ${show.location || ''} ${dateStr ? `&nbsp; <i class="fas fa-calendar"></i> ${dateStr}` : ''}</p>
        </div>
        <i class="fas fa-chevron-right"></i>
      </div>
    `;
  }).join('');
  console.log('Show list rendered');
}

// ============ REP SELECT / TABS ============

function renderShowTabs() {
  const container = document.getElementById('show-tabs');
  container.innerHTML = `
    <button class="tab active" onclick="switchTab('reps', this)">Reps</button>
    <button class="tab" onclick="switchTab('master', this)">Master</button>
    <button class="tab" onclick="switchTab('customers', this)">Customers</button>
    <button class="tab" onclick="switchTab('opps', this)">Current Opps</button>
    <button class="tab" onclick="switchTab('dashboard', this)">Dashboard</button>
  `;
}

async function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  
  if (tab === 'reps') {
    currentRepId = null;
    renderRepList();
  } else if (tab === 'dashboard') {
    await showDashboard();
  } else {
    currentRepId = null;
    currentListType = tab === 'master' ? LIST_TYPES.MASTER : tab === 'customers' ? LIST_TYPES.CUSTOMERS : LIST_TYPES.CURRENT_OPPS;
    await loadBoothList();
    hideAllViews();
    document.getElementById('list-view').classList.add('active');
    updateListTitle();
  }
}

function renderRepList() {
  const container = document.getElementById('rep-content');
  
  container.innerHTML = `
    <div class="rep-list">
      ${reps.map(rep => `
        <div class="rep-card" onclick="selectRep('${rep.id}')">
          <div class="rep-avatar">${rep.name.charAt(0)}</div>
          <span>${rep.name}</span>
          <i class="fas fa-chevron-right"></i>
        </div>
      `).join('')}
    </div>
  `;
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
    result = result.filter(b => 
      (b.companyName || '').toLowerCase().includes(q) ||
      (b.boothNumber || '').toLowerCase().includes(q) ||
      (b.domain || '').toLowerCase().includes(q)
    );
  }

  if (filters.platform !== 'all') {
    if (filters.platform === '[No Platform]') {
      result = result.filter(b => !b.platform);
    } else {
      result = result.filter(b => b.platform === filters.platform);
    }
  }

  if (filters.protection !== 'all') {
    if (filters.protection === '[No Protection]') {
      result = result.filter(b => !b.protection);
    } else {
      result = result.filter(b => (b.protection || '').toLowerCase().includes(filters.protection.toLowerCase()));
    }
  }

  if (filters.returns !== 'all') {
    if (filters.returns === '[No Returns]') {
      result = result.filter(b => !b.returns);
    } else {
      result = result.filter(b => (b.returns || '').toLowerCase().includes(filters.returns.toLowerCase()));
    }
  }

  if (filters.minRevenue > 0) {
    result = result.filter(b => (b.estimatedMonthlySales || 0) >= filters.minRevenue);
  }

  if (filters.status !== 'all') {
    result = result.filter(b => b.status === filters.status);
  }

  switch (sortBy) {
    case 'booth':
      result.sort((a, b) => (parseInt(a.boothNumber) || 99999) - (parseInt(b.boothNumber) || 99999));
      break;
    case 'value':
      result.sort((a, b) => (b.estimatedMonthlySales || 0) - (a.estimatedMonthlySales || 0));
      break;
    case 'name':
      result.sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
      break;
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
    list.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No booths found</p>${booths.length === 0 ? '<button onclick="showAdminModal()">Import Data</button>' : '<button onclick="clearFilters()">Clear filters</button>'}</div>`;
    return;
  }

  list.innerHTML = filtered.map(b => `
    <div class="booth-item" onclick="showDetailView('${b.id}')">
      <div class="booth-left">
        <div class="status-dot ${b.status || 'not_visited'}"></div>
        <span class="booth-number">${b.boothNumber || '-'}</span>
      </div>
      <div class="booth-center">
        <div class="company-name">${b.companyName || 'Unknown'}</div>
        <div class="booth-meta">
          ${b.platform || ''}
          ${b.protection ? `<span class="competitor"> • ${b.protection}</span>` : '<span class="no-protection"> • No protection</span>'}
        </div>
      </div>
      <div class="booth-right">
        <span class="sales-value">${formatCurrency(b.estimatedMonthlySales)}</span>
        <i class="fas fa-chevron-right"></i>
      </div>
    </div>
  `).join('');
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
  
  let count = 0;
  let chips = [];

  if (filters.platform !== 'all') { count++; chips.push(`<button class="filter-chip" onclick="filters.platform='all';renderBoothList()">${filters.platform} <i class="fas fa-times"></i></button>`); }
  if (filters.protection !== 'all') { count++; chips.push(`<button class="filter-chip" onclick="filters.protection='all';renderBoothList()">${filters.protection} <i class="fas fa-times"></i></button>`); }
  if (filters.returns !== 'all') { count++; chips.push(`<button class="filter-chip" onclick="filters.returns='all';renderBoothList()">${filters.returns} <i class="fas fa-times"></i></button>`); }
  if (filters.minRevenue > 0) { count++; chips.push(`<button class="filter-chip" onclick="filters.minRevenue=0;renderBoothList()">≥ ${formatCurrency(filters.minRevenue)} <i class="fas fa-times"></i></button>`); }
  if (filters.status !== 'all') { count++; chips.push(`<button class="filter-chip" onclick="filters.status='all';renderBoothList()">${STATUS_LABELS[filters.status]} <i class="fas fa-times"></i></button>`); }

  if (count > 0) {
    chips.push(`<button class="clear-all-btn" onclick="clearFilters()">Clear All</button>`);
    container.innerHTML = chips.join('');
    container.classList.remove('hidden');
    badge.textContent = count;
    badge.classList.remove('hidden');
    btn.classList.add('active');
  } else {
    container.classList.add('hidden');
    badge.classList.add('hidden');
    btn.classList.remove('active');
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
  
  document.getElementById('detail-content').innerHTML = `
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
    </div>

    <div class="section">
      <div class="section-title">Status</div>
      <div class="status-buttons">
        ${Object.entries(STATUS).map(([key, val]) => `
          <button class="status-btn ${val} ${booth.status === val ? 'active' : ''}" onclick="setStatus('${val}')">
            <i class="fas fa-${val === 'not_visited' ? 'circle' : val === 'follow_up' ? 'clock' : val === 'demo_booked' ? 'calendar' : 'times-circle'}"></i>
            ${STATUS_LABELS[val]}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Contact Info</div>
      <input type="text" class="input" id="contact-name" placeholder="Contact name..." value="${booth.contactName || ''}" onchange="updateBoothField('contactName', this.value)">
      <div class="picker-row">
        <button class="picker-btn" onclick="togglePicker('orders')">
          <label>Orders/mo</label><span id="orders-value">${booth.ordersPerMonth || 'N/A'}</span><i class="fas fa-chevron-down"></i>
        </button>
        <button class="picker-btn" onclick="togglePicker('aov')">
          <label>AOV</label><span id="aov-value">${booth.aov || 'N/A'}</span><i class="fas fa-chevron-down"></i>
        </button>
      </div>
      <div id="orders-picker" class="options-list hidden">${ORDER_OPTIONS.map(o => `<div class="option-item ${booth.ordersPerMonth === o ? 'active' : ''}" onclick="selectOption('ordersPerMonth', '${o}')">${o}</div>`).join('')}</div>
      <div id="aov-picker" class="options-list hidden">${AOV_OPTIONS.map(o => `<div class="option-item ${booth.aov === o ? 'active' : ''}" onclick="selectOption('aov', '${o}')">${o}</div>`).join('')}</div>
    </div>

    <div class="section">
      <div class="section-title">Notes</div>
      <textarea class="input" id="notes-input" placeholder="Tap mic to dictate..." onchange="updateBoothField('notes', this.value)">${booth.notes || ''}</textarea>
    </div>

    <div class="section">
      <div class="section-title">Business Card</div>
      <div id="card-container">
        ${booth.businessCardData 
          ? `<div class="card-preview"><img src="${booth.businessCardData}" alt="Card"><div class="card-actions"><button class="card-action" onclick="openCamera()"><i class="fas fa-camera"></i> Retake</button><button class="card-action danger" onclick="removeCard()"><i class="fas fa-trash"></i> Remove</button></div></div>`
          : `<button class="capture-card-btn" onclick="openCamera()"><i class="fas fa-camera"></i> Capture Business Card</button>`}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Submit to Slack</div>
      <div class="submit-row">
        <button class="submit-btn" onclick="copyForFollowUp()"><i class="fas fa-copy"></i> Copy for Follow Up</button>
        <button class="submit-btn demo" onclick="copyForDemo()"><i class="fas fa-calendar"></i> Copy for Demo</button>
      </div>
      <button class="slack-btn" onclick="openSlack()"><i class="fab fa-slack"></i> Open Slack Workflow <i class="fas fa-external-link-alt" style="font-size:12px;opacity:0.6"></i></button>
    </div>
  `;

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
  document.getElementById('filter-options').innerHTML = `
    <div class="filter-section">
      <div class="filter-section-title">Platform</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.platform === 'all' ? 'active' : ''}" onclick="setTempFilter('platform', 'all')">All</button>
        ${PLATFORMS.map(p => `<button class="filter-option ${tempFilters.platform === p ? 'active' : ''}" onclick="setTempFilter('platform', '${p}')">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Protection</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.protection === 'all' ? 'active' : ''}" onclick="setTempFilter('protection', 'all')">All</button>
        ${PROTECTION_PROVIDERS.map(p => `<button class="filter-option ${tempFilters.protection === p ? 'active' : ''}" onclick="setTempFilter('protection', '${p}')">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Returns</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.returns === 'all' ? 'active' : ''}" onclick="setTempFilter('returns', 'all')">All</button>
        ${RETURNS_PROVIDERS.map(p => `<button class="filter-option ${tempFilters.returns === p ? 'active' : ''}" onclick="setTempFilter('returns', '${p}')">${p}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Min Revenue</div>
      <div class="filter-options">
        ${REVENUE_THRESHOLDS.map(t => `<button class="filter-option ${tempFilters.minRevenue === t ? 'active' : ''}" onclick="setTempFilter('minRevenue', ${t})">${t === 0 ? 'Any' : '≥ ' + formatCurrency(t)}</button>`).join('')}
      </div>
    </div>
    <div class="filter-section">
      <div class="filter-section-title">Status</div>
      <div class="filter-options">
        <button class="filter-option ${tempFilters.status === 'all' ? 'active' : ''}" onclick="setTempFilter('status', 'all')">All</button>
        ${Object.entries(STATUS).map(([k, v]) => `<button class="filter-option ${tempFilters.status === v ? 'active' : ''}" onclick="setTempFilter('status', '${v}')">${STATUS_LABELS[v]}</button>`).join('')}
      </div>
    </div>
  `;
}

function setTempFilter(key, value) { tempFilters[key] = value; renderFilterOptions(); }
function applyFilters() { filters = { ...tempFilters }; hideFilterModal(); renderBoothList(); }
function clearFilters() { filters = { platform: 'all', protection: 'all', returns: 'all', minRevenue: 0, status: 'all' }; tempFilters = { ...filters }; hideFilterModal(); renderBoothList(); }

// ============ DASHBOARD ============

async function renderDashboard() {
  const stats = await getDashboardStats(currentShowId);
  const container = document.getElementById('dashboard-content');
  
  const totals = stats.reduce((acc, s) => ({
    toVisit: acc.toVisit + s.toVisit,
    followUp: acc.followUp + s.followUp,
    demos: acc.demos + s.demos,
    dq: acc.dq + s.dq,
    total: acc.total + s.total
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
  showAdminTab('shows'); 
}
function hideAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  const content = document.getElementById('admin-content');
  
  if (tab === 'shows') {
    content.innerHTML = `
      <div class="admin-list">
        ${shows.map(s => `<div class="admin-item"><span>${s.name}</span><span class="muted">${s.location}</span></div>`).join('')}
      </div>
      <button class="btn primary full" onclick="addShowPrompt()"><i class="fas fa-plus"></i> Add Show</button>
    `;
  } else if (tab === 'reps') {
    content.innerHTML = `
      <div class="admin-list">
        ${reps.map(r => `<div class="admin-item"><span>${r.name}</span></div>`).join('')}
      </div>
      <button class="btn primary full" onclick="addRepPrompt()"><i class="fas fa-plus"></i> Add Rep</button>
    `;
  } else if (tab === 'import') {
    content.innerHTML = `
      <div class="import-section">
        <label>Select Show</label>
        <select id="import-show" class="input">${shows.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        
        <label>Select Rep (for Hit List)</label>
        <select id="import-rep" class="input">
          <option value="">-- None (Master/Customers/Opps) --</option>
          ${reps.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
        </select>
        
        <label>List Type</label>
        <select id="import-list-type" class="input">
          <option value="${LIST_TYPES.HIT_LIST}">Hit List</option>
          <option value="${LIST_TYPES.MASTER}">Master</option>
          <option value="${LIST_TYPES.CUSTOMERS}">Customers</option>
          <option value="${LIST_TYPES.CURRENT_OPPS}">Current Opps</option>
        </select>
        
        <label>Google Sheet URL</label>
        <input type="url" id="import-url" class="input" placeholder="https://docs.google.com/spreadsheets/d/...">
        <button class="btn primary full" onclick="importFromSheet()"><i class="fas fa-cloud-download-alt"></i> Import from Sheet</button>
        
        <div class="divider">OR</div>
        
        <label>Paste Data (Tab-delimited)</label>
        <textarea id="import-paste" class="input" rows="6" placeholder="Paste from Google Sheets..."></textarea>
        <button class="btn primary full" onclick="importFromPaste()"><i class="fas fa-paste"></i> Import Pasted Data</button>
      </div>
    `;
  }
}

async function addShowPrompt() {
  const name = prompt('Show name:'); if (!name) return;
  const location = prompt('Location:') || '';
  const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
  await saveShow({ id, name, location, startDate: '', endDate: '', website: '', exhibitorList: '' });
  shows = await getShows();
  showAdminTab('shows');
}

async function addRepPrompt() {
  const name = prompt('Rep name:'); if (!name) return;
  const id = name.toLowerCase().replace(/\s+/g, '_');
  await saveRep({ id, name });
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
    const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=tsv`;
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error('Could not fetch sheet - make sure it\'s publicly accessible');
    const text = await response.text();
    processImportData(text);
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
}

function importFromPaste() {
  const text = document.getElementById('import-paste').value.trim();
  if (!text) return alert('Paste data first');
  processImportData(text);
}

function processImportData(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return alert('No data found');
  
  const headers = lines[0].split('\t').map(h => h.trim());
  pendingImportData = { headers, lines: lines.slice(1) };
  
  showMapperModal();
}

function showMapperModal() {
  const { headers } = pendingImportData;
  
  // Auto-detect mappings
  columnMapping = {};
  const headerLower = headers.map(h => h.toLowerCase());
  
  REQUIRED_FIELDS.forEach(field => {
    const patterns = {
      companyName: ['company name', 'company', 'name', 'merchant'],
      boothNumber: ['booth', 'booth#', 'booth number', 'booth #'],
      domain: ['domain', 'website', 'url', 'company domain'],
      estimatedMonthlySales: ['est monthly sales', 'estimated monthly sales', 'monthly sales', 'revenue', 'gmv'],
      platform: ['platform', 'ecommerce platform', 'cart'],
      protection: ['protection', 'competitor', 'competitor tracking', 'shipping protection'],
      returns: ['returns', 'return provider', 'returns provider']
    };
    
    const found = headerLower.findIndex(h => patterns[field.key]?.some(p => h.includes(p)));
    if (found >= 0) columnMapping[field.key] = found;
  });
  
  renderMapperContent();
  document.getElementById('mapper-modal').classList.remove('hidden');
}

function renderMapperContent() {
  const { headers } = pendingImportData;
  
  document.getElementById('mapper-content').innerHTML = `
    <p class="hint">Map your columns to the required fields:</p>
    <div class="mapper-grid">
      ${REQUIRED_FIELDS.map(field => `
        <div class="mapper-row">
          <label>${field.label}${field.required ? ' *' : ''}</label>
          <select class="input" onchange="columnMapping['${field.key}'] = this.value === '' ? undefined : parseInt(this.value)">
            <option value="">-- Skip --</option>
            ${headers.map((h, i) => `<option value="${i}" ${columnMapping[field.key] === i ? 'selected' : ''}>${h}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  `;
}

function hideMapperModal() {
  document.getElementById('mapper-modal').classList.add('hidden');
  pendingImportData = null;
}

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
      showId,
      repId,
      listType,
      companyName: vals[columnMapping.companyName] || '',
      boothNumber: columnMapping.boothNumber !== undefined ? vals[columnMapping.boothNumber] : '',
      domain: columnMapping.domain !== undefined ? vals[columnMapping.domain] : '',
      estimatedMonthlySales: columnMapping.estimatedMonthlySales !== undefined ? parseFloat((vals[columnMapping.estimatedMonthlySales] || '0').replace(/[$,]/g, '')) || 0 : 0,
      platform: columnMapping.platform !== undefined ? vals[columnMapping.platform] : '',
      protection: columnMapping.protection !== undefined ? vals[columnMapping.protection] : '',
      returns: columnMapping.returns !== undefined ? vals[columnMapping.returns] : '',
      status: STATUS.NOT_VISITED,
      notes: '',
      contactName: '',
      ordersPerMonth: 'N/A',
      aov: 'N/A',
      businessCardData: null
    };
    
    if (booth.companyName) newBooths.push(booth);
  }
  
  if (newBooths.length === 0) return alert('No valid data found');
  
  // Clear existing data for this list
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
