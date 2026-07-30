import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Search contact by email
  if (action === 'search') {
    const { email } = body;
    const data = await hs('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      limit: 1,
      properties: ['email', 'firstname', 'lastname'],
    });
    return json({ found: (data.total ?? 0) > 0, id: data.results?.[0]?.id ?? null });
  }

  // Create contact (legacy direct call)
  if (action === 'create') {
    const { properties } = body;
    const data = await hs('/crm/v3/objects/contacts', 'POST', { properties });
    return json({ id: data.id ?? null, error: data.message ?? null });
  }

  // Full sync: find/create/update contact + optionally create deal + Slack notification
  if (action === 'sync') {
    const { booth, showName, isDemoBooked, notifySlack } = body;

    // Build contact properties from booth data
    const nameParts = (booth.contactName || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    const contactProps: Record<string, string> = {
      company:        booth.companyName || '',
      hs_lead_source: 'TRADESHOW',
    };
    if (booth.contactEmail) contactProps.email     = booth.contactEmail;
    if (firstName)          contactProps.firstname = firstName;
    if (lastName)           contactProps.lastname  = lastName;
    if (booth.contactTitle) contactProps.jobtitle  = booth.contactTitle;
    if (booth.contactPhone) contactProps.phone     = booth.contactPhone;
    if (booth.domain)       contactProps.website   = booth.domain;

    let contactId: string | null = null;
    let contactCreated = false;

    if (booth.contactEmail) {
      const search = await hs('/crm/v3/objects/contacts/search', 'POST', {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: booth.contactEmail }] }],
        limit: 1,
        properties: ['email', 'firstname', 'lastname'],
      });

      if ((search.total ?? 0) > 0) {
        contactId = search.results[0].id;
        // Update existing contact properties
        await hs(`/crm/v3/objects/contacts/${contactId}`, 'PATCH', { properties: contactProps });
      } else {
        const created = await hs('/crm/v3/objects/contacts', 'POST', { properties: contactProps });
        contactId = created.id ?? null;
        contactCreated = true;
      }
    }

    // Create deal for Demo Booked (only when we have a contact and no existing deal)
    let dealId: string | null = null;
    if (isDemoBooked && contactId && !booth.hsDealId) {
      const pipeline  = Deno.env.get('HUBSPOT_DEAL_PIPELINE') || 'default';
      const dealStage = Deno.env.get('HUBSPOT_DEAL_STAGE')    || 'appointmentscheduled';

      const dealProps: Record<string, string> = {
        dealname:  `${booth.companyName || 'Unknown'} — ${showName || 'Tradeshow'} Demo`,
        pipeline,
        dealstage: dealStage,
      };
      if (booth.estimatedMonthlySales) dealProps.amount = String(booth.estimatedMonthlySales);

      const deal = await hs('/crm/v3/objects/deals', 'POST', { properties: dealProps });
      dealId = deal.id ?? null;

      if (dealId) {
        await hs(
          `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`,
          'PUT'
        );
      }
    }

    // Slack notification (only fires when notifySlack=true, i.e. first time entering Follow Up/Demo)
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhook && notifySlack) {
      const header = isDemoBooked ? '🗓️ *Demo Booked*' : '🔥 *Follow Up*';
      const lines  = [
        `${header} — ${booth.companyName || 'Unknown'}`,
        booth.contactName
          ? `👤 ${booth.contactName}${booth.contactTitle ? `, ${booth.contactTitle}` : ''}`
          : null,
        booth.contactEmail ? `✉️ ${booth.contactEmail}` : null,
        booth.platform ? `🛒 ${booth.platform}` : null,
        booth.estimatedMonthlySales
          ? `💰 ~$${Number(booth.estimatedMonthlySales).toLocaleString()}/mo`
          : null,
        booth.notes  ? `📝 ${booth.notes}` : null,
        showName     ? `📍 ${showName}`    : null,
      ].filter(Boolean).join('\n');

      await fetch(slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lines }),
      });
    }

    return json({ contactId, contactCreated, dealId });
  }

  return json({ error: 'Unknown action' }, 400);
});
