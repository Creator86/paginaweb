/**
 * ==============================================================================
 * REMARKETING ENGINE — GitHub Actions Cron
 * ==============================================================================
 * Secretos requeridos en GitHub (Settings → Secrets → Actions):
 *   SUPABASE_URL    — URL de tu proyecto Supabase
 *   SUPABASE_KEY    — Service Role Key de Supabase
 *   RESEND_API_KEY  — API Key de Resend
 *   SENDER_EMAIL    — Correo remitente (ej: onboarding@resend.dev)
 *   SENDER_NAME     — Nombre del remitente (ej: Mi Negocio)
 *   OFFER_LINK      — Enlace a tu oferta de pago (opcional)
 * ==============================================================================
 */
import process from 'node:process';

const SUPABASE_URL   = (process.env.SUPABASE_URL   || "https://fwlpggmavtwmqwlbglzb.supabase.co").replace(/\/+$/, '');
const SUPABASE_KEY   = process.env.SUPABASE_KEY    || "sb_publishable_5BNqcwnpX3-cC1__G162AQ_pHSnG38a";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL   = process.env.SENDER_EMAIL    || 'onboarding@resend.dev';
const SENDER_NAME    = process.env.SENDER_NAME     || 'NexusFlow Production Site';
const OFFER_LINK     = process.env.OFFER_LINK      || "https://tudominio.com/oferta";
const FREEBIE_URL    = "https://drive.google.com/";
const SUPABASE_TABLE = "funnel_leads";

const STEPS = [
  { step: 1, delayDays: 0,  subject: '🎁 Aquí tienes tu acceso al recurso gratuito',
    content: `Hola {{nombre}},\n\n¡Gracias por registrarte! Aquí tu enlace directo:\n\n👉 {{freebie}}\n\n¡Un abrazo!\n${SENDER_NAME}` },
  { step: 2, delayDays: 2,  subject: '💡 El error #1 que frena tus resultados',
    content: `Hola {{nombre}},\n\nEl error más común es no tener una estructura clara. Si tienes alguna duda sobre el recurso, responde este correo.\n\n${SENDER_NAME}` },
  { step: 3, delayDays: 4,  subject: '🚀 Caso práctico: de cero a resultados medibles',
    content: `Hola {{nombre}},\n\n¿Ya revisaste el recurso?\n\n👉 {{freebie}}\n\nMañana te comparto las 3 preguntas frecuentes.\n\n${SENDER_NAME}` },
  { step: 4, delayDays: 6,  subject: '❓ Las 3 preguntas que todos se hacen',
    content: `Hola {{nombre}},\n\n1. ¿Necesito conocimientos avanzados? No.\n2. ¿Cuánto tarda? Días.\n3. ¿Funciona para mi nicho? Sí.\n\n${SENDER_NAME}` },
  { step: 5, delayDays: 8,  subject: '🔥 Oferta especial exclusiva para suscriptores',
    content: `Hola {{nombre}},\n\nAcceso preferente con descuento exclusivo:\n\n👉 {{enlace_oferta}}\n\nDisponible solo 48 horas.\n\n${SENDER_NAME}` },
  { step: 6, delayDays: 10, subject: '⏳ Últimas horas para aprovechar la oferta',
    content: `Hola {{nombre}},\n\nCierra hoy a medianoche:\n\n👉 {{enlace_oferta}}\n\n¡Mucho éxito!\n\n${SENDER_NAME}` },
];

async function sendEmail({ to, subject, body }) {
  if (!RESEND_API_KEY) {
    console.log(`[SIMULACIÓN] Correo a ${to}: "${subject}"`);
    return { id: 'simulated_' + Date.now() };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${SENDER_NAME} <${SENDER_EMAIL}>`, to: [to], subject, text: body }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  console.log('🚀 Iniciando motor de remarketing...');
  if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('❌ SUPABASE_URL y SUPABASE_KEY son requeridos.'); process.exit(1); }

  const now = new Date();
  const leads = await supabaseFetch(`${SUPABASE_TABLE}?status=eq.active&current_step=lt.${STEPS.length}&select=id,name,email,freebie_url,current_step,created_at,last_email_sent_at`);
  console.log(`📋 Leads activos: ${leads.length}`);

  let sent = 0, skipped = 0;
  for (const lead of leads) {
    const stepIndex = lead.current_step;
    if (stepIndex >= STEPS.length) { skipped++; continue; }
    const step = STEPS[stepIndex];
    const refDate = lead.last_email_sent_at ? new Date(lead.last_email_sent_at) : new Date(lead.created_at);
    const daysSinceRef = (now - refDate) / 86400000;
    if (daysSinceRef < step.delayDays) { skipped++; continue; }

    const freebieUrl = lead.freebie_url || FREEBIE_URL || '';
    const body = step.content
      .replace(/{{nombre}}/g, lead.name || 'amigo')
      .replace(/{{freebie}}/g, freebieUrl)
      .replace(/{{enlace_oferta}}/g, OFFER_LINK);

    try {
      const result = await sendEmail({ to: lead.email, subject: step.subject, body });
      console.log(`✅ Correo #${stepIndex + 1} enviado a ${lead.email} | ID: ${result.id}`);
      await supabaseFetch(`${SUPABASE_TABLE}?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ current_step: stepIndex + 1, last_email_sent_at: now.toISOString(), status: stepIndex + 1 >= STEPS.length ? 'completed' : 'active' }),
      });
      sent++;
    } catch (err) {
      console.error(`❌ Error enviando a ${lead.email}: ${err.message}`);
    }
  }
  console.log(`\n📊 Resumen: ${sent} enviados, ${skipped} omitidos.`);
}

main().catch((err) => { console.error('💥 Error fatal:', err); process.exit(1); });
