// Database Layer
// Uses Supabase when configured, falls back to localStorage

let supabase = null;
let useSupabase = false;

// Initialize database
async function initDB() {
  if (SUPABASE_URL !== 'https://your-project.supabase.co') {
    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      useSupabase = true;
      console.log('Using Supabase');
    } catch (e) {
      console.warn('Supabase init failed, using localStorage', e);
    }
  } else {
    console.log('Using localStorage (Supabase not configured)');
  }
  
  // Initialize default data if needed
  await initializeDefaults();
}

async function initializeDefaults() {
  let shows = JSON.parse(localStorage.getItem('shows') || '[]');
  if (shows.length === 0) {
    shows = DEFAULT_SHOWS;
    localStorage.setItem('shows', JSON.stringify(shows));
  }
  
  let reps = JSON.parse(localStorage.getItem('reps') || '[]');
  if (reps.length === 0) {
    reps = DEFAULT_REPS;
    localStorage.setItem('reps', JSON.stringify(reps));
  }
}

// ============ SHOWS ============

async function getShows() {
  if (useSupabase) {
    const { data } = await supabase.from('shows').select('*').order('start_date');
    return data || [];
  }
  return JSON.parse(localStorage.getItem('shows') || '[]');
}

async function saveShow(show) {
  if (useSupabase) {
    const { data, error } = await supabase.from('shows').upsert({
      id: show.id,
      name: show.name,
      location: show.location,
      start_date: show.startDate,
      end_date: show.endDate,
      website: show.website,
      exhibitor_list: show.exhibitorList
    });
    return !error;
  }
  const shows = await getShows();
  const idx = shows.findIndex(s => s.id === show.id);
  if (idx >= 0) shows[idx] = show;
  else shows.push(show);
  localStorage.setItem('shows', JSON.stringify(shows));
  return true;
}

async function deleteShow(showId) {
  if (useSupabase) {
    await supabase.from('shows').delete().eq('id', showId);
    await supabase.from('booths').delete().eq('show_id', showId);
  } else {
    const shows = (await getShows()).filter(s => s.id !== showId);
    localStorage.setItem('shows', JSON.stringify(shows));
    // Also delete related booths
    const allBooths = JSON.parse(localStorage.getItem('booths') || '[]');
    localStorage.setItem('booths', JSON.stringify(allBooths.filter(b => b.showId !== showId)));
  }
}

// ============ REPS ============

async function getReps() {
  if (useSupabase) {
    const { data } = await supabase.from('reps').select('*').order('name');
    return data || [];
  }
  return JSON.parse(localStorage.getItem('reps') || '[]');
}

async function saveRep(rep) {
  if (useSupabase) {
    await supabase.from('reps').upsert({ id: rep.id, name: rep.name });
  } else {
    const reps = await getReps();
    const idx = reps.findIndex(r => r.id === rep.id);
    if (idx >= 0) reps[idx] = rep;
    else reps.push(rep);
    localStorage.setItem('reps', JSON.stringify(reps));
  }
}

async function deleteRep(repId) {
  if (useSupabase) {
    await supabase.from('reps').delete().eq('id', repId);
    await supabase.from('booths').delete().eq('rep_id', repId);
  } else {
    const reps = (await getReps()).filter(r => r.id !== repId);
    localStorage.setItem('reps', JSON.stringify(reps));
    const allBooths = JSON.parse(localStorage.getItem('booths') || '[]');
    localStorage.setItem('booths', JSON.stringify(allBooths.filter(b => b.repId !== repId)));
  }
}

// ============ BOOTHS ============

async function getBooths(showId, repId = null, listType = null) {
  if (useSupabase) {
    let query = supabase.from('booths').select('*').eq('show_id', showId);
    if (repId) query = query.eq('rep_id', repId);
    if (listType) query = query.eq('list_type', listType);
    const { data } = await query;
    return (data || []).map(mapBoothFromDB);
  }
  
  let booths = JSON.parse(localStorage.getItem('booths') || '[]');
  booths = booths.filter(b => b.showId === showId);
  if (repId) booths = booths.filter(b => b.repId === repId);
  if (listType) booths = booths.filter(b => b.listType === listType);
  return booths;
}

async function getAllBoothsForShow(showId) {
  if (useSupabase) {
    const { data } = await supabase.from('booths').select('*').eq('show_id', showId);
    return (data || []).map(mapBoothFromDB);
  }
  return JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.showId === showId);
}

async function saveBooth(booth) {
  if (useSupabase) {
    await supabase.from('booths').upsert(mapBoothToDB(booth));
  } else {
    const booths = JSON.parse(localStorage.getItem('booths') || '[]');
    const idx = booths.findIndex(b => b.id === booth.id);
    if (idx >= 0) booths[idx] = booth;
    else booths.push(booth);
    localStorage.setItem('booths', JSON.stringify(booths));
  }
}

async function saveBooths(boothsToSave) {
  if (useSupabase) {
    await supabase.from('booths').upsert(boothsToSave.map(mapBoothToDB));
  } else {
    const existing = JSON.parse(localStorage.getItem('booths') || '[]');
    const existingIds = new Set(existing.map(b => b.id));
    const newBooths = boothsToSave.filter(b => !existingIds.has(b.id));
    const updated = existing.map(b => {
      const update = boothsToSave.find(u => u.id === b.id);
      return update || b;
    });
    localStorage.setItem('booths', JSON.stringify([...updated, ...newBooths]));
  }
}

async function deleteBooth(boothId) {
  if (useSupabase) {
    await supabase.from('booths').delete().eq('id', boothId);
  } else {
    const booths = JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.id !== boothId);
    localStorage.setItem('booths', JSON.stringify(booths));
  }
}

async function deleteBoothsForList(showId, repId, listType) {
  if (useSupabase) {
    await supabase.from('booths').delete()
      .eq('show_id', showId)
      .eq('rep_id', repId)
      .eq('list_type', listType);
  } else {
    const booths = JSON.parse(localStorage.getItem('booths') || '[]')
      .filter(b => !(b.showId === showId && b.repId === repId && b.listType === listType));
    localStorage.setItem('booths', JSON.stringify(booths));
  }
}

// Map booth from DB format to app format
function mapBoothFromDB(row) {
  return {
    id: row.id,
    showId: row.show_id,
    repId: row.rep_id,
    listType: row.list_type,
    companyName: row.company_name,
    domain: row.domain,
    boothNumber: row.booth_number,
    estimatedMonthlySales: row.estimated_monthly_sales,
    platform: row.platform,
    protection: row.protection,
    returns: row.returns,
    status: row.status,
    notes: row.notes,
    contactName: row.contact_name,
    ordersPerMonth: row.orders_per_month,
    aov: row.aov,
    businessCardData: row.business_card_data,
    updatedAt: row.updated_at
  };
}

// Map booth from app format to DB format
function mapBoothToDB(booth) {
  return {
    id: booth.id,
    show_id: booth.showId,
    rep_id: booth.repId,
    list_type: booth.listType,
    company_name: booth.companyName,
    domain: booth.domain,
    booth_number: booth.boothNumber,
    estimated_monthly_sales: booth.estimatedMonthlySales,
    platform: booth.platform,
    protection: booth.protection,
    returns: booth.returns,
    status: booth.status,
    notes: booth.notes,
    contact_name: booth.contactName,
    orders_per_month: booth.ordersPerMonth,
    aov: booth.aov,
    business_card_data: booth.businessCardData,
    updated_at: new Date().toISOString()
  };
}

// ============ DASHBOARD ============

async function getDashboardStats(showId) {
  const allBooths = await getAllBoothsForShow(showId);
  const reps = await getReps();
  
  const stats = reps.map(rep => {
    const repBooths = allBooths.filter(b => b.repId === rep.id && b.listType === LIST_TYPES.HIT_LIST);
    return {
      repId: rep.id,
      repName: rep.name,
      toVisit: repBooths.filter(b => b.status === STATUS.NOT_VISITED).length,
      followUp: repBooths.filter(b => b.status === STATUS.FOLLOW_UP).length,
      demos: repBooths.filter(b => b.status === STATUS.DEMO_BOOKED).length,
      dq: repBooths.filter(b => b.status === STATUS.DQ).length,
      total: repBooths.length
    };
  });
  
  // Sort by demos desc, then follow_up desc
  stats.sort((a, b) => {
    if (b.demos !== a.demos) return b.demos - a.demos;
    return b.followUp - a.followUp;
  });
  
  return stats;
}

// ============ EXPORT ============

async function exportToCSV(showId, repId = null, listType = null) {
  const booths = repId 
    ? await getBooths(showId, repId, listType)
    : await getAllBoothsForShow(showId);
  
  const headers = ['Company Name', 'Booth', 'Domain', 'Est Monthly Sales', 'Platform', 'Protection', 'Returns', 'Status', 'Contact', 'Orders/Mo', 'AOV', 'Notes', 'Rep', 'List Type'];
  
  const rows = booths.map(b => [
    b.companyName,
    b.boothNumber,
    b.domain,
    b.estimatedMonthlySales,
    b.platform,
    b.protection,
    b.returns,
    STATUS_LABELS[b.status] || b.status,
    b.contactName,
    b.ordersPerMonth,
    b.aov,
    (b.notes || '').replace(/"/g, '""'),
    b.repId,
    LIST_LABELS[b.listType] || b.listType
  ]);
  
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  return csv;
}
