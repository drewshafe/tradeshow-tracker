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
    
    // Initialize default data (localStorage only)
    if (!useSupabase) {
      let shows = JSON.parse(localStorage.getItem('shows') || '[]');
      if (shows.length === 0) {
        localStorage.setItem('shows', JSON.stringify(DEFAULT_SHOWS));
      }
      
      let reps = JSON.parse(localStorage.getItem('reps') || '[]');
      if (reps.length === 0) {
        localStorage.setItem('reps', JSON.stringify(DEFAULT_REPS));
      }
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
      await sbClient.from('people').delete().eq('show_id', showId);
    } else {
      const shows = (await window.getShows()).filter(s => s.id !== showId);
      localStorage.setItem('shows', JSON.stringify(shows));
      const booths = JSON.parse(localStorage.getItem('booths') || '[]').filter(b => b.showId !== showId);
      localStorage.setItem('booths', JSON.stringify(booths));
      const people = JSON.parse(localStorage.getItem('people') || '[]').filter(p => p.showId !== showId);
      localStorage.setItem('people', JSON.stringify(people));
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
      await sbClient.from('reps').upsert({ id: rep.id, name: rep.name, hubspot_id: rep.hubspotId });
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

  // Get booths for a rep's hit list INCLUDING tagged Working/Opps
  window.getHitListWithTags = async function(showId, repId) {
    console.log('getHitListWithTags called:', { showId, repId });
    const allBooths = await window.getAllBoothsForShow(showId);
    console.log('All booths for show:', allBooths.length);
    
    // Debug: show unique repIds and listTypes in the data
    const uniqueRepIds = [...new Set(allBooths.map(b => b.repId))];
    const uniqueListTypes = [...new Set(allBooths.map(b => b.listType))];
    console.log('Unique repIds in data:', uniqueRepIds);
    console.log('Unique listTypes in data:', uniqueListTypes);
    
    // Get direct hit list items
    const hitList = allBooths.filter(b => b.listType === LIST_TYPES.HIT_LIST && b.repId === repId);
    console.log('Hit list items for repId "' + repId + '":', hitList.length);
    
    // Get Working items assigned to this rep (via ownerId -> repId mapping)
    const working = allBooths.filter(b => b.listType === LIST_TYPES.WORKING && getRepIdFromOwner(b.ownerId) === repId)
      .map(b => ({ ...b, tag: 'Working' }));
    
    // Get Opps items assigned to this rep
    const opps = allBooths.filter(b => b.listType === LIST_TYPES.OPPS && getRepIdFromOwner(b.ownerId) === repId)
      .map(b => ({ ...b, tag: 'Opps' }));
    
    return [...hitList, ...working, ...opps];
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
    console.log('saveBooths called with', boothsToSave.length, 'booths');
    console.log('First booth:', boothsToSave[0]);
    if (useSupabase) {
      const mapped = boothsToSave.map(mapBoothToDB);
      console.log('First mapped booth for DB:', mapped[0]);
      const { data, error } = await sbClient.from('booths').upsert(mapped);
      if (error) console.error('Supabase upsert error:', error);
      else console.log('Supabase upsert success');
    } else {
      const existing = JSON.parse(localStorage.getItem('booths') || '[]');
      const existingIds = new Set(existing.map(b => b.id));
      const newBooths = boothsToSave.filter(b => !existingIds.has(b.id));
      const updated = existing.map(b => boothsToSave.find(u => u.id === b.id) || b);
      localStorage.setItem('booths', JSON.stringify([...updated, ...newBooths]));
    }
  };

  window.deleteBoothsForList = async function(showId, repId, listType) {
    console.log('deleteBoothsForList called:', { showId, repId, listType });
    if (useSupabase) {
      let query = sbClient.from('booths').delete().eq('show_id', showId).eq('list_type', listType);
      if (repId) query = query.eq('rep_id', repId);
      else query = query.is('rep_id', null);
      const { error } = await query;
      if (error) console.error('Delete error:', error);
      else console.log('Delete success');
    } else {
      const booths = JSON.parse(localStorage.getItem('booths') || '[]')
        .filter(b => !(b.showId === showId && b.repId === repId && b.listType === listType));
      localStorage.setItem('booths', JSON.stringify(booths));
    }
  };

  // Claim a lead from Inactive Customers
  window.claimLead = async function(boothId, repId, showId) {
    const booths = await window.getAllBoothsForShow(showId);
    const booth = booths.find(b => b.id === boothId);
    if (!booth) return null;
    
    // Update the booth with claimed info
    booth.claimedBy = repId;
    booth.claimedAt = new Date().toISOString();
    await window.saveBooth(booth);
    
    // Create a copy in the rep's hit list
    const hitListCopy = {
      ...booth,
      id: `${booth.showId}_${repId}_hit_list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      listType: LIST_TYPES.HIT_LIST,
      repId: repId,
      status: STATUS.NOT_VISITED,
      sourceListType: LIST_TYPES.INACTIVE_CUSTOMERS,
      sourceBoothId: boothId,
      claimedBy: null,
      claimedAt: null
    };
    await window.saveBooth(hitListCopy);
    
    return hitListCopy;
  };

  // ============ PEOPLE ============
  window.getPeople = async function(showId) {
    if (useSupabase) {
      const { data } = await sbClient.from('people').select('*').eq('show_id', showId);
      return (data || []).map(mapPersonFromDB);
    }
    return JSON.parse(localStorage.getItem('people') || '[]').filter(p => p.showId === showId);
  };

  window.getPeopleByDomain = async function(showId, domain) {
    if (!domain) return [];
    const allPeople = await window.getPeople(showId);
    return allPeople.filter(p => p.domain && p.domain.toLowerCase() === domain.toLowerCase());
  };

  window.savePeople = async function(peopleToSave) {
    if (useSupabase) {
      await sbClient.from('people').upsert(peopleToSave.map(mapPersonToDB));
    } else {
      const existing = JSON.parse(localStorage.getItem('people') || '[]');
      const existingIds = new Set(existing.map(p => p.id));
      const newPeople = peopleToSave.filter(p => !existingIds.has(p.id));
      const updated = existing.map(p => peopleToSave.find(u => u.id === p.id) || p);
      localStorage.setItem('people', JSON.stringify([...updated, ...newPeople]));
    }
  };

  window.deletePeopleForShow = async function(showId) {
    if (useSupabase) {
      await sbClient.from('people').delete().eq('show_id', showId);
    } else {
      const people = JSON.parse(localStorage.getItem('people') || '[]').filter(p => p.showId !== showId);
      localStorage.setItem('people', JSON.stringify(people));
    }
  };

  // ============ MAPPERS ============
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
      updatedAt: row.updated_at,
      // Extended fields
      recordId: row.record_id,
      ownerId: row.owner_id,
      lastContacted: row.last_contacted,
      campaign: row.campaign,
      competitorInstalls: row.competitor_installs,
      competitorUninstalls: row.competitor_uninstalls,
      techInstalls: row.tech_installs,
      instagramFollowers: row.instagram_followers,
      facebookFollowers: row.facebook_followers,
      monthlyVisits: row.monthly_visits,
      associatedDeal: row.associated_deal,
      associatedDealIds: row.associated_deal_ids,
      dealRecordId: row.deal_record_id,
      dealName: row.deal_name,
      claimedBy: row.claimed_by,
      claimedAt: row.claimed_at,
      sourceListType: row.source_list_type,
      sourceBoothId: row.source_booth_id,
      tag: row.tag
    };
  }

  function mapBoothToDB(booth) {
    return {
      id: booth.id,
      show_id: booth.showId,
      rep_id: booth.repId || null,
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
      updated_at: new Date().toISOString(),
      // Extended fields
      record_id: booth.recordId,
      owner_id: booth.ownerId,
      last_contacted: booth.lastContacted,
      campaign: booth.campaign,
      competitor_installs: booth.competitorInstalls,
      competitor_uninstalls: booth.competitorUninstalls,
      tech_installs: booth.techInstalls,
      instagram_followers: booth.instagramFollowers,
      facebook_followers: booth.facebookFollowers,
      monthly_visits: booth.monthlyVisits,
      associated_deal: booth.associatedDeal,
      associated_deal_ids: booth.associatedDealIds,
      deal_record_id: booth.dealRecordId,
      deal_name: booth.dealName,
      claimed_by: booth.claimedBy,
      claimed_at: booth.claimedAt,
      source_list_type: booth.sourceListType,
      source_booth_id: booth.sourceBoothId,
      tag: booth.tag
    };
  }

  function mapPersonFromDB(row) {
    return {
      id: row.id,
      showId: row.show_id,
      firstName: row.first_name,
      lastName: row.last_name,
      jobTitle: row.job_title,
      companyName: row.company_name,
      domain: row.domain,
      sales: row.sales,
      dateCompleted: row.date_completed
    };
  }

  function mapPersonToDB(person) {
    return {
      id: person.id,
      show_id: person.showId,
      first_name: person.firstName,
      last_name: person.lastName,
      job_title: person.jobTitle,
      company_name: person.companyName,
      domain: person.domain,
      sales: person.sales,
      date_completed: person.dateCompleted
    };
  }

  // ============ DASHBOARD ============
  window.getDashboardStats = async function(showId) {
    const allBooths = await window.getAllBoothsForShow(showId);
    const reps = await window.getReps();
    
    const stats = reps.map(rep => {
      // Direct hit list items
      const hitList = allBooths.filter(b => b.listType === LIST_TYPES.HIT_LIST && b.repId === rep.id);
      // Working/Opps assigned to this rep
      const working = allBooths.filter(b => b.listType === LIST_TYPES.WORKING && getRepIdFromOwner(b.ownerId) === rep.id);
      const opps = allBooths.filter(b => b.listType === LIST_TYPES.OPPS && getRepIdFromOwner(b.ownerId) === rep.id);
      
      const combined = [...hitList, ...working, ...opps];
      
      return {
        repId: rep.id,
        repName: rep.name,
        toVisit: combined.filter(b => b.status === STATUS.NOT_VISITED || !b.status).length,
        followUp: combined.filter(b => b.status === STATUS.FOLLOW_UP).length,
        demos: combined.filter(b => b.status === STATUS.DEMO_BOOKED).length,
        dq: combined.filter(b => b.status === STATUS.DQ).length,
        total: combined.length,
        hitListCount: hitList.length,
        workingCount: working.length,
        oppsCount: opps.length
      };
    });
    
    stats.sort((a, b) => b.demos !== a.demos ? b.demos - a.demos : b.followUp - a.followUp);
    return stats;
  };

  // ============ EXPORT ============
  window.exportToCSV = async function(showId, repId, listType) {
    const booths = repId ? await window.getBooths(showId, repId, listType) : await window.getAllBoothsForShow(showId);
    const headers = ['Company Name', 'Booth', 'Domain', 'Est Monthly Sales', 'Platform', 'Protection', 'Returns', 'Status', 'Contact', 'Orders/Mo', 'AOV', 'Notes', 'Rep', 'List Type', 'Owner'];
    const rows = booths.map(b => [
      b.companyName, b.boothNumber, b.domain, b.estimatedMonthlySales, b.platform, b.protection, b.returns,
      STATUS_LABELS[b.status] || b.status, b.contactName, b.ordersPerMonth, b.aov,
      (b.notes || '').replace(/"/g, '""'), b.repId, LIST_LABELS[b.listType] || b.listType, getOwnerName(b.ownerId)
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
  };
})();
