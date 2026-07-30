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

  // ── Silent background sync (status change without submit modal) ───────────
  // Finds/creates contact, creates deal if demo booked. No Slack.
  if (action === 'sync') {
    const { booth, showName, isDemoBooked } = body;
    const { contactId, contactCreated, dealId } = await syncContact(hs, booth, showName, isDemoBooked);
    return json({ contactId, contactCreated, dealId });
  }

  // ── Full submit (replaces Zapier: contact + deal + Slack) ─────────────────
  if (action === 'submit') {
    const { payload, isDemoBooked, showName } = body;

    // Build a booth-shaped object from the submit payload for syncContact
    const booth = {
      companyName:         payload.companyName,
      contactName:         payload.contactName,
      contactTitle:        payload.contactTitle,
      contactEmail:        payload.contactEmail,
      contactPhone:        payload.contactPhone,
      domain:              payload.domain,
      recordId:            payload.recordId  || null,
      hsDealId:            payload.hsDealId  || null,
      estimatedMonthlySales: null,
    };

    const { contactId, dealId } = await syncContact(hs, booth, showName, isDemoBooked);

    // Build Slack message matching the old Zapier format
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

      const TRACKER_URL = 'https://drewshafe.github.io/tradeshow-tracker/';
      const LOGO_URL    = 'https://drewshafe.github.io/tradeshow-tracker/TST_showsheets.png';
      const trackerLink = `\n<${TRACKER_URL}|Open Show Sheets>`;
      const fullText    = text + trackerLink;

      const attachments: Record<string, unknown>[] = [];
      if (payload.businessCardUrl) {
        attachments.push({ image_url: payload.businessCardUrl, fallback: 'Business Card' });
      }

      const slackBody: Record<string, unknown> = {
        username,
        text: fullText,
        icon_url: LOGO_URL,
        attachments,
      };

      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackBody),
      });
    }

    return json({ contactId, dealId });
  }

  return json({ error: 'Unknown action' }, 400);
});

// ── Shared contact + deal sync logic ─────────────────────────────────────────
async function syncContact(
  hs: (path: string, method: string, body?: unknown) => Promise<unknown>,
  booth: Record<string, unknown>,
  showName: string,
  isDemoBooked: boolean,
): Promise<{ contactId: string | null; contactCreated: boolean; dealId: string | null }> {
  const nameParts = ((booth.contactName as string) || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

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
      await hs(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', { properties: contactProps });
    } else {
      const created = await hs('/crm/v3/objects/contacts', 'POST', { properties: contactProps }) as { id?: string };
      contactId = created.id ?? null;
      contactCreated = true;
    }
  }

  let dealId: string | null = null;
  if (isDemoBooked && contactId && !booth.hsDealId) {
    const pipeline  = Deno.env.get('HUBSPOT_DEAL_PIPELINE') || 'default';
    const dealStage = Deno.env.get('HUBSPOT_DEAL_STAGE')    || 'appointmentscheduled';
    const dealProps: Record<string, string> = {
      dealname:  `${(booth.companyName as string) || 'Unknown'} — ${showName || 'Tradeshow'} Demo`,
      pipeline,
      dealstage: dealStage,
    };
    if (booth.estimatedMonthlySales) dealProps.amount = String(booth.estimatedMonthlySales);

    const deal = await hs('/crm/v3/objects/deals', 'POST', { properties: dealProps }) as { id?: string };
    dealId = deal.id ?? null;

    if (dealId) {
      await hs(`/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, 'PUT');
    }
  }

  return { contactId, contactCreated, dealId };
}
