import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_LABELS: Record<string, string> = {
  demo_booked: 'Demo Booked',
  follow_up_warm: 'Warm Follow-Up',
  follow_up_warm_direct: 'Warm Follow-Up (Direct Intro)',
  follow_up_warm_intro: 'Warm Follow-Up (Needs Intro)',
  follow_up_cold: 'Cold Follow-Up',
  not_visited: 'Not Visited',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const booth = await req.json();

  const techContext = [
    booth.protection && `Current protection: ${booth.protection}`,
    booth.returns && `Current returns platform: ${booth.returns}`,
    booth.helpDesk && `Help desk: ${booth.helpDesk}`,
    booth.subscriptions && `Subscriptions: ${booth.subscriptions}`,
  ].filter(Boolean).join('\n');

  const prompt = `You are a sales rep at ShipInsure, a package protection and post-purchase experience platform for Shopify merchants. Write a personalized post-tradeshow follow-up email based on the context below.

Company: ${booth.companyName || 'Unknown'}
Contact: ${booth.contactName || 'their team'}${booth.contactTitle ? `, ${booth.contactTitle}` : ''}
Platform: ${booth.platform || 'unknown'}
Status from show: ${STATUS_LABELS[booth.status] || booth.status || 'unknown'}
${techContext ? `Tech stack:\n${techContext}` : ''}
Notes from the conversation: ${booth.notes || 'None'}
${booth.estimatedMonthlySales ? `Est. monthly revenue: $${Number(booth.estimatedMonthlySales).toLocaleString()}` : ''}

Write a concise, personalized follow-up email. Rules:
- If notes mention a specific conversation, reference it naturally
- If they use a competitor for protection (Route, Navidium, etc.) mention it only if it strengthens the pitch
- 3-4 short paragraphs, conversational tone — not a template
- CTA should match status: Demo Booked → confirm/prep the demo; Warm → schedule a demo; Cold → softer ask (happy to share info, etc.)
- Sign off from Drew (ShipInsure)

Return ONLY valid JSON with two keys: "subject" (string) and "body" (string, use actual newlines not \\n).`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await anthropicRes.json();
  const text = result.content?.[0]?.text ?? '';

  let parsed: { subject: string; body: string };
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match![0]);
  } catch {
    parsed = { subject: `Following up from the show — ${booth.companyName}`, body: text };
  }

  return new Response(JSON.stringify(parsed), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
