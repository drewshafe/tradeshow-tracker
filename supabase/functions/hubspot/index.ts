import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PORTAL_ID = '22466049';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const token = Deno.env.get('HUBSPOT_TOKEN');
  if (!token) return json({ error: 'HUBSPOT_TOKEN not configured' }, 500);

  const hs = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`https://api.hubapi.com${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  const body = await req.json();
  const { action } = body;

  // ── Search contact by email (used by CRM Bot badge) ──────────────────────
  if (action === 'search') {
    const { email } = body;
    const data = await hs('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      limit: 1,
      properties: ['email', 'firstname', 'lastname'],
    });
    return json({ found: (data.total ?? 0) > 0, id: data.results?.[0]?.id ?? null });
  }

  // ── Legacy direct create ──────────────────────────────────────────────────
  if (action === 'create') {
    const { properties } = body;
    const data = await hs('/crm/v3/objects/contacts', 'POST', { properties });
    return json({ id: data.id ?? null, error: data.message ?? null });
  }

  // ── Silent background sync (status change, no Slack, no task) ─────────────
  if (action === 'sync') {
    const { booth, showName, isDemoBooked, repOwnerId } = body;
    const result = await syncContact(hs, booth, showName, isDemoBooked, repOwnerId, null, null);
    return json({ contactId: result.contactId, contactCreated: result.contactCreated, dealId: result.dealId, companyId: result.companyId });
  }

  // ── Full submit (contact + company + deal/task + Slack) ───────────────────
  if (action === 'submit') {
    const { payload, isDemoBooked, showName } = body;

    const booth = {
      companyName:           payload.companyName,
      contactName:           payload.contactName,
      contactTitle:          payload.contactTitle,
      contactEmail:          payload.contactEmail,
      contactPhone:          payload.contactPhone,
      domain:                payload.domain,
      recordId:              payload.recordId  || null,
      hsDealId:              payload.hsDealId  || null,
      estimatedMonthlySales: null,
    };

    const repOwnerId = payload.repHubSpotId || null;
    // Tasks only for follow-ups (demos get a deal instead)
    const taskDate   = !isDemoBooked ? (payload.taskDate || null) : null;
    const taskNotes  = payload.notes || null;

    const { contactId, dealId, companyId } = await syncContact(
      hs, booth, showName, isDemoBooked, repOwnerId, taskDate, taskNotes,
    );

    // ── HubSpot note via v1 Engagements API ───────────────────────────────
    const notes = payload.notes || '';
    if (notes && (contactId || dealId)) {
      try {
        const noteBody = [
          `${isDemoBooked ? 'Demo Booked' : 'Follow Up'} — ${showName}`,
          `Rep: ${payload.repName || ''}`,
          payload.ordersPerMonth ? `Monthly orders: ${payload.ordersPerMonth}` : '',
          payload.aov           ? `AOV: ${payload.aov}`                       : '',
          `Notes: ${notes}`,
        ].filter(Boolean).join('\n');

        const associations: Record<string, number[]> = {};
        if (contactId) associations.contactIds = [parseInt(contactId)];
        if (companyId) associations.companyIds  = [parseInt(companyId)];
        if (dealId)    associations.dealIds      = [parseInt(dealId)];

        await hs('/engagements/v1/engagements', 'POST', {
          engagement: {
            active:    true,
            ownerId:   repOwnerId ? parseInt(repOwnerId) : undefined,
            type:      'NOTE',
            timestamp: new Date().getTime(),
          },
          associations,
          metadata: { body: noteBody },
        });
      } catch {
        // Note creation is best-effort
      }
    }

    // ── Slack notification ─────────────────────────────────────────────────
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhook) {
      const statusLabel = isDemoBooked ? 'Demo Booked' : 'Follow Up';
      const username    = `TST ${showName} | ${statusLabel}`;
      const hasCard     = payload.hasBusinessCard ? 'true' : 'false';
      const orders      = payload.ordersPerMonth  || 'N/A';
      const aov         = payload.aov             || 'N/A';
      const notes       = payload.notes           || 'N/A';

      let hsLink = '';
      if (isDemoBooked && dealId) {
        hsLink = `\n<https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-3/${dealId}|View Deal>`;
      } else if (payload.hubspotCompanyUrl) {
        hsLink = `\n<${payload.hubspotCompanyUrl}|View Company>`;
      } else if (contactId) {
        hsLink = `\n<https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-1/${contactId}|View Contact>`;
      }

      let text: string;
      if (isDemoBooked) {
        text = `Demo Booked! by ${payload.repName}\n\nContact: ${payload.contactName}\nCompany: ${payload.companyName}\nBusiness Card Submitted: ${hasCard}\nMonthly store orders: ${orders}\nAOV: ${aov}\nNotes: ${notes}\n—${hsLink}`;
      } else {
        text = `${payload.campaign || showName} Follow Up Submission by ${payload.repName}\n\nContact: ${payload.contactName}\nCompany: ${payload.companyName}\nBusiness Card Submitted: ${hasCard}\nMonthly store orders: ${orders}\nAOV: ${aov}\nNotes: ${notes}\n—${hsLink}`;
      }

      const BASE_URL    = 'https://drewshafe.github.io/tradeshow-tracker/';
      const LOGO_URL    = `${BASE_URL}TST_showsheets.png`;
      const deepLink    = payload.boothId && payload.showId && payload.repId
        ? `${BASE_URL}#show=${payload.showId}&rep=${payload.repId}&booth=${payload.boothId}`
        : BASE_URL;
      const trackerLink = `\n<${deepLink}|Open in Show Sheets>`;

      const attachments: Record<string, unknown>[] = [];
      if (payload.businessCardUrl) {
        attachments.push({ image_url: payload.businessCardUrl, fallback: 'Business Card' });
      }

      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, text: text + trackerLink, icon_url: LOGO_URL, attachments }),
      });
    }

    return json({ contactId, dealId });
  }

  return json({ error: 'Unknown action' }, 400);
});

// ── Shared sync logic ─────────────────────────────────────────────────────────
// Owner is set ONLY when creating new records — never overwritten on existing ones
// to avoid displacing existing CRM ownership.
async function syncContact(
  hs: (path: string, method: string, body?: unknown) => Promise<unknown>,
  booth: Record<string, unknown>,
  showName: string,
  isDemoBooked: boolean,
  repOwnerId?: string | null,
  taskDate?: string | null,
  taskNotes?: string | null,
): Promise<{ contactId: string | null; contactCreated: boolean; dealId: string | null; companyId: string | null }> {
  const nameParts = ((booth.contactName as string) || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  // ── 1. Find/create contact ────────────────────────────────────────────────
  const contactProps: Record<string, string> = {
    company:        (booth.companyName as string) || '',
    hs_lead_source: 'TRADESHOW',
  };
  if (booth.contactEmail) contactProps.email     = booth.contactEmail as string;
  if (firstName)          contactProps.firstname = firstName;
  if (lastName)           contactProps.lastname  = lastName;
  if (booth.contactTitle) contactProps.jobtitle  = booth.contactTitle as string;
  if (booth.contactPhone) contactProps.phone     = booth.contactPhone as string;
  if (booth.domain)       contactProps.website   = booth.domain as string;

  let contactId: string | null = null;
  let contactCreated = false;

  if (booth.contactEmail) {
    const search = await hs('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: booth.contactEmail }] }],
      limit: 1,
      properties: ['email'],
    }) as { total?: number; results?: Array<{ id: string }> };

    if ((search.total ?? 0) > 0) {
      contactId = search.results![0].id;
      // Update without touching owner — respect existing assignment
      await hs(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', { properties: contactProps });
    } else {
      // New contact: assign rep as owner
      if (repOwnerId) contactProps.hubspot_owner_id = repOwnerId;
      const created = await hs('/crm/v3/objects/contacts', 'POST', { properties: contactProps }) as { id?: string };
      contactId = created.id ?? null;
      contactCreated = true;
    }
  }

  // ── 2. Find/create company ────────────────────────────────────────────────
  let companyId: string | null = null;

  const searchCompany = async (prop: string, value: string): Promise<string | null> => {
    const res = await hs('/crm/v3/objects/companies/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: prop, operator: 'EQ', value }] }],
      limit: 1,
      properties: ['domain', 'name'],
    }) as { total?: number; results?: Array<{ id: string }> };
    return (res.total ?? 0) > 0 ? res.results![0].id : null;
  };

  try {
    if (booth.domain)       companyId = await searchCompany('domain', booth.domain as string);
    if (!companyId && booth.companyName) companyId = await searchCompany('name', booth.companyName as string);

    if (!companyId && booth.companyName) {
      // New company: assign rep as owner
      const companyProps: Record<string, string> = { name: booth.companyName as string };
      if (booth.domain) companyProps.domain = booth.domain as string;
      if (repOwnerId)   companyProps.hubspot_owner_id = repOwnerId;
      const created = await hs('/crm/v3/objects/companies', 'POST', { properties: companyProps }) as { id?: string };
      companyId = created.id ?? null;
    }

    // Associate contact → company
    if (contactId && companyId) {
      await hs(`/crm/v3/objects/contacts/${contactId}/associations/companies/${companyId}/contact_to_company`, 'PUT');
    }
  } catch {
    // Company steps are best-effort — don't block the rest of the sync
  }

  // ── 3. Deal (Demo Booked only) ────────────────────────────────────────────
  let dealId: string | null = null;
  if (isDemoBooked && contactId && !booth.hsDealId) {
    const pipeline  = Deno.env.get('HUBSPOT_DEAL_PIPELINE') || 'default';
    const dealStage = Deno.env.get('HUBSPOT_DEAL_STAGE')    || 'appointmentscheduled';
    const dealProps: Record<string, string> = {
      dealname:  `${(booth.companyName as string) || 'Unknown'} — ${showName || 'Tradeshow'} Demo`,
      pipeline,
      dealstage: dealStage,
    };
    if (repOwnerId)                  dealProps.hubspot_owner_id = repOwnerId;
    if (booth.estimatedMonthlySales) dealProps.amount = String(booth.estimatedMonthlySales);

    const deal = await hs('/crm/v3/objects/deals', 'POST', { properties: dealProps }) as { id?: string };
    dealId = deal.id ?? null;

    if (dealId) {
      await hs(`/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, 'PUT');
      if (companyId) {
        await hs(`/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, 'PUT');
      }
    }
  }

  // ── 4. Follow-up task (submit only, when rep picked a date) ──────────────
  if (!isDemoBooked && taskDate && contactId && repOwnerId) {
    try {
      const contactName = (booth.contactName as string) || 'Contact';
      const companyName = (booth.companyName as string) || 'Unknown';
      const taskBody = `Follow up: ${contactName} at ${companyName} — ${showName}${taskNotes ? `\n\n${taskNotes}` : ''}`;

      const task = await hs('/crm/v3/objects/tasks', 'POST', {
        properties: {
          hs_task_body:     taskBody,
          hs_timestamp:     new Date(taskDate).toISOString(),
          hs_task_status:   'NOT_STARTED',
          hs_task_type:     'TODO',
          hubspot_owner_id: repOwnerId,
        },
      }) as { id?: string };

      const taskId = task.id ?? null;
      if (taskId) {
        await hs(`/crm/v3/objects/tasks/${taskId}/associations/contacts/${contactId}/task_to_contact`, 'PUT');
        if (companyId) {
          await hs(`/crm/v3/objects/tasks/${taskId}/associations/companies/${companyId}/task_to_company`, 'PUT');
        }
      }
    } catch {
      // Task creation is best-effort
    }
  }

  return { contactId, contactCreated, dealId, companyId };
}
