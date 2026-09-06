import process from 'node:process';

const SUPABASE_URL        = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY        = process.env.SUPABASE_KEY || '';
const MAILERLITE_API_KEY  = process.env.MAILERLITE_API_KEY || '';
const MAILERLITE_GROUP_ID = process.env.MAILERLITE_GROUP_ID || '';
const SUPABASE_TABLE      = process.env.SUPABASE_TABLE || 'funnel_leads';

async function addSubscriberToMailerLite(lead) {
  const body = {
    email: lead.email,
    fields: { name: lead.name || '' },
    status: 'active',
  };
  if (MAILERLITE_GROUP_ID) { body.groups = [MAILERLITE_GROUP_ID]; }
  const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${MAILERLITE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MailerLite error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function getNewLeads() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?status=eq.active&current_step=eq.0&select=*`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase GET error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function markLeadAsSynced(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ current_step: 1, status: 'active', last_email_sent_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase PATCH error ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log('Sincronizando leads de Supabase a MailerLite...\n');
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('ERROR: SUPABASE_URL y SUPABASE_KEY requeridos.'); process.exit(1); }
  if (!MAILERLITE_API_KEY) { console.error('ERROR: MAILERLITE_API_KEY requerido.'); process.exit(1); }

  const leads = await getNewLeads();
  console.log(`Leads nuevos: ${leads.length}`);
  if (leads.length === 0) { console.log('Sin leads nuevos.'); return; }

  let synced = 0, errors = 0;
  for (const lead of leads) {
    try {
      const r = await addSubscriberToMailerLite(lead);
      console.log(`OK: ${lead.email} -> MailerLite [${r?.data?.id ?? 'OK'}]`);
      await markLeadAsSynced(lead.id);
      synced++;
    } catch (err) {
      console.error(`ERROR ${lead.email}: ${err.message}`);
      errors++;
    }
  }
  console.log(`\nResumen: ${synced} sincronizados, ${errors} errores.`);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
