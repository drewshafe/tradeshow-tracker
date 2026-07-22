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
  if (!token) return json({ error: 'HUBSPOT_TOKEN not configured in Supabase secrets' }, 500);

  const hs = (path: string, method: string, body?: unknown) =>
    fetch(`https://api.hubapi.com${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json());

  const { action, email, properties } = await req.json();

  if (action === 'search') {
    const data = await hs('/crm/v3/objects/contacts/search', 'POST', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      limit: 1,
      properties: ['email', 'firstname', 'lastname'],
    });
    return json({ found: (data.total ?? 0) > 0, id: data.results?.[0]?.id ?? null });
  }

  if (action === 'create') {
    const data = await hs('/crm/v3/objects/contacts', 'POST', { properties });
    return json({ id: data.id ?? null, error: data.message ?? null });
  }

  return json({ error: 'Unknown action' }, 400);
});
