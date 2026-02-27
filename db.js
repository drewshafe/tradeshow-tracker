// Database Layer - IIFE to avoid global conflicts
(function() {
  let sbClient = null;
  let useSupabase = false;

  // Initialize database
  window.initDB = async function() {
    if (typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL !== 'https://your-project.supabase.co') {
      try {
        sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        useSupabase = true;
        console.log('Using Supabase');
      } catch (e) {
        console.warn('Supabase init failed, using localStorage', e);
      }
    } else {
      console.log('Using localStorage');
    }
    
    // Initialize default data
    let shows = JSON.parse(localStorage.getItem('shows') || '[]');
    if (shows.length === 0) {
      localStorage.setItem('shows', JSON.stringify(DEFAULT_SHOWS));
    }
    
    let reps = JSON.parse(localStorage.getItem('reps') || '[]');
    if (reps.length === 0) {
      localStorage.setItem('reps', JSON.stringify(DEFAULT_REPS));
    }
  };

  // ============ SHOWS ============
  window.getShows = async function() {
    if (useSupabase) {
      const { data } = await sbClient.from('shows').select('*').order('start_date');
      return data || [];
    }
    return JSON.parse(localStorage.getItem('shows') || '[]');
  };

  window.saveShow = async function(show) {
    if (useSupabase) {
      await sbClient.from('shows').upsert({
        id: show.id, name: show.name, location: show.location,
        start_date: show.startDate, end_date: show.endDate,
        website: show.website, exhibitor_list: show.exhibitorList
      });
    } else {
      const shows = await window.getShows();
      const idx = shows.findIndex(s => s.id === show.id);
      if (idx >= 0) shows[idx] = show;
      else shows.push(show);
      localStorage.setItem('shows', JSON.stringify(shows));
    }
  };

  window.deleteShow = async function(showId) {
    if (useSupabase) {
      await sbClient.from('shows').delete().eq('id', showId);
      await sbClient.from('booths').delete().eq('show_id', showId);
    } else {
      const shows = (await window.getShows()).filter(s => s.id !== showId);
      localStorage.setItem('shows', JSON.stringify(shows));
      const booths = JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.showId !== showId);
      localStorage.setItem('booths', JSON.stringify(booths));
    }
  };

  // ============ REPS ============
  window.getReps = async function() {
    if (useSupabase) {
      const { data } = await sbClient.from('reps').select('*').order('name');
      return data || [];
    }
    return JSON.parse(localStorage.getItem('reps') || '[]');
  };

  window.saveRep = async function(rep) {
    if (useSupabase) {
      await sbClient.from('reps').upsert({ id: rep.id, name: rep.name });
    } else {
      const reps = await window.getReps();
      const idx = reps.findIndex(r => r.id === rep.id);
      if (idx >= 0) reps[idx] = rep;
      else reps.push(rep);
      localStorage.setItem('reps', JSON.stringify(reps));
    }
  };

  window.deleteRep = async function(repId) {
    if (useSupabase) {
      await sbClient.from('reps').delete().eq('id', repId);
      await sbClient.from('booths').delete().eq('rep_id', repId);
    } else {
      const reps = (await window.getReps()).filter(r => r.id !== repId);
      localStorage.setItem('reps', JSON.stringify(reps));
      const booths = JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.repId !== repId);
      localStorage.setItem('booths', JSON.stringify(booths));
    }
  };

  // ============ BOOTHS ============
  window.getBooths = async function(showId, repId, listType) {
    if (useSupabase) {
      let query = sbClient.from('booths').select('*').eq('show_id', showId);
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
  };

  window.getAllBoothsForShow = async function(showId) {
    if (useSupabase) {
      const { data } = await sbClient.from('booths').select('*').eq('show_id', showId);
      return (data || []).map(mapBoothFromDB);
    }
    return JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.showId === showId);
  };

  window.saveBooth = async function(booth) {
    if (useSupabase) {
      await sbClient.from('booths').upsert(mapBoothToDB(booth));
    } else {
      const booths = JSON.parse(localStorage.getItem('booths') || '[]');
      const idx = booths.findIndex(b => b.id === booth.id);
      if (idx >= 0) booths[idx] = booth;
      else booths.push(booth);
      localStorage.setItem('booths', JSON.stringify(booths));
    }
  };

  window.saveBooths = async function(boothsToSave) {
    if (useSupabase) {
      await sbClient.from('booths').upsert(boothsToSave.map(mapBoothToDB));
    } else {
      const existing = JSON.parse(localStorage.getItem('booths') || '[]');
      const existingIds = new Set(existing.map(b => b.id));
      const newBooths = boothsToSave.filter(b => !existingIds.has(b.id));
      const updated = existing.map(b => boothsToSave.find(u => u.id === b.id) || b);
      localStorage.setItem('booths', JSON.stringify([...updated, ...newBooths]));
    }
  };

  window.deleteBoothsForList = async function(showId, repId, listType) {
    if (useSupabase) {
      await sbClient.from('booths').delete().eq('show_id', showId).eq('rep_id', repId).eq('list_type', listType);
    } else {
      const booths = JSON.parse(localStorage.getItem('booths') || '[]')
        .filter(b => !(b.showId === showId && b.repId === repId && b.listType === listType));
      localStorage.setItem('booths', JSON.stringify(booths));
    }
  };

  // Mappers
  function mapBoothFromDB(row) {
    return {
      id: row.id, showId: row.show_id, repId: row.rep_id, listType: row.list_type,
      companyName: row.company_name, domain: row.domain, boothNumber: row.booth_number,
      estimatedMonthlySales: row.estimated_monthly_sales, platform: row.platform,
      protection: row.protection, returns: row.returns, status: row.status,
      notes: row.notes, contactName: row.contact_name, ordersPerMonth: row.orders_per_month,
      aov: row.aov, businessCardData: row.business_card_data, updatedAt: row.updated_at
    };
  }

  function mapBoothToDB(booth) {
    return {
      id: booth.id, show_id: booth.showId, rep_id: booth.repId, list_type: booth.listType,
      company_name: booth.companyName, domain: booth.domain, booth_number: booth.boothNumber,
      estimated_monthly_sales: booth.estimatedMonthlySales, platform: booth.platform,
      protection: booth.protection, returns: booth.returns, status: booth.status,
      notes: booth.notes, contact_name: booth.contactName, orders_per_month: booth.ordersPerMonth,
      aov: booth.aov, business_card_data: booth.businessCardData, updated_at: new Date().toISOString()
    };
  }

  // ============ DASHBOARD ============
  window.getDashboardStats = async function(showId) {
    const allBooths = await window.getAllBoothsForShow(showId);
    const reps = await window.getReps();
    
    const stats = reps.map(rep => {
      const repBooths = allBooths.filter(b => b.repId === rep.id && b.listType === LIST_TYPES.HIT_LIST);
      return {
        repId: rep.id, repName: rep.name,
        toVisit: repBooths.filter(b => b.status === STATUS.NOT_VISITED).length,
        followUp: repBooths.filter(b => b.status === STATUS.FOLLOW_UP).length,
        demos: repBooths.filter(b => b.status === STATUS.DEMO_BOOKED).length,
        dq: repBooths.filter(b => b.status === STATUS.DQ).length,
        total: repBooths.length
      };
    });
    
    stats.sort((a, b) => b.demos !== a.demos ? b.demos - a.demos : b.followUp - a.followUp);
    return stats;
  };

  // ============ EXPORT ============
  window.exportToCSV = async function(showId, repId, listType) {
    const booths = repId ? await window.getBooths(showId, repId, listType) : await window.getAllBoothsForShow(showId);
    const headers = ['Company Name', 'Booth', 'Domain', 'Est Monthly Sales', 'Platform', 'Protection', 'Returns', 'Status', 'Contact', 'Orders/Mo', 'AOV', 'Notes', 'Rep', 'List Type'];
    const rows = booths.map(b => [
      b.companyName, b.boothNumber, b.domain, b.estimatedMonthlySales, b.platform, b.protection, b.returns,
      STATUS_LABELS[b.status] || b.status, b.contactName, b.ordersPerMonth, b.aov,
      (b.notes || '').replace(/"/g, '""'), b.repId, LIST_LABELS[b.listType] || b.listType
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  };
})();
