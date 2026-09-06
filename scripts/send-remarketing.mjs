/**
 * REMARKETING ENGINE — GitHub Actions Cron
 * Secretos requeridos en GitHub (Settings → Secrets → Actions):
 *   SUPABASE_URL   — URL de tu proyecto Supabase
 *   SUPABASE_KEY   — Service Role Key de Supabase (Settings → API → service_role)
 *   RESEND_API_KEY — API Key de Resend
 *   SENDER_EMAIL   — onboarding@resend.dev  (o tu dominio verificado)
 *   SENDER_NAME    — El nombre de tu negocio
 *   OFFER_LINK     — Enlace a tu oferta (opcional)
 */
import process from 'node:process';

const SUPABASE_URL   = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY   = process.env.SUPABASE_KEY   || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const SENDER_EMAIL   = process.env.SENDER_EMAIL   || 'onboarding@resend.dev';
const SENDER_NAME    = process.env.SENDER_NAME    || 'Tu Negocio';
const OFFER_LINK     = process.env.OFFER_LINK     || 'https://tudominio.com/oferta';

const STEPS = [
  {
    step: 1, delayDays: 0,
    subject: '🎁 Aquí tienes tu acceso al recurso gratuito',
    content: `Hola {{nombre}},\n\n¡Gracias por registrarte! Aquí tu enlace directo:\n\n👉 {{freebie}}\n\nTe recomiendo guardarlo en favoritos.\n\n¡Un abrazo!\n${SENDER_NAME}`,
  },
  {
    step: 2, delayDays: 2,
    subject: '💡 El error #1 que frena tus resultados',
    content: `Hola {{nombre}},\n\nEl error más común es no tener una estructura clara. Si tienes alguna duda sobre el recurso, responde este correo.\n\n${SENDER_NAME}`,
  },
  {
    step: 3, delayDays: 4,
    subject: '🚀 Caso práctico: de cero a resultados medibles',
    content: `Hola {{nombre}},\n\n¿Ya revisaste el recurso?\n\n👉 {{freebie}}\n\nMañana te comparto las 3 preguntas más frecuentes.\n\n${SENDER_NAME}`,
  },
  {
    step: 4, delayDays: 6,
    subject: '❓ Las 3 preguntas que todos se hacen antes de empezar',
    content: `Hola {{nombre}},\n\n1. ¿Necesito conocimientos avanzados? No.\n2. ¿Cuánto tarda ver resultados? Días.\n3. ¿Funciona para cualquier nicho? Sí.\n\n${SENDER_NAME}`,
  },
  {
    step: 5, delayDays: 8,
    subject: '🔥 Oferta especial exclusiva para suscriptores',
    content: `Hola {{nombre}},\n\nAcceso preferente con descuento exclusivo:\n\n👉 {{enlace_oferta}}\n\nDisponible solo 48 horas.\n\n${SENDER_NAME}`,
  },
  {
    step: 6, delayDays: 10,
    subject: '⏳ Últimas horas para aprovechar la oferta',
    content: `Hola {{nombre}},\n\nCierra hoy a medianoche:\n\n👉 {{enlace_oferta}}\n\n¡Mucho éxito!\n\n${SENDER_NAME}`,
  },
];

async function sendEmail({ to, subject, body }) {
  if (!RESEND_API_KEY) {
    console.log(`[SIMULACIÓN] Correo a ${to}: "${subject}"`);
    return { id: 'simulated_' + Date.now() };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
  return res.json();
}

async function supabasePatch(id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/funnel_leads?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH error ${res.status}: ${await res.text()}`);
}

async function main() {
  console.log('🚀 Iniciando motor de remarketing...');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ SUPABASE_URL y SUPABASE_KEY son requeridos.');
    process.exit(1);
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/funnel_leads?status=eq.active&select=*`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!res.ok) {
    console.error(`❌ Error Supabase ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const leads = await res.json();
  console.log(`📋 Leads activos: ${leads.length}`);

  let sent = 0;
  const now = Date.now();

  for (const lead of leads) {
    const nextStep = (lead.current_step || 0) + 1;

    if (nextStep > STEPS.length) {
      await supabasePatch(lead.id, { status: 'completed' });
      console.log(`✅ ${lead.email} completó la secuencia.`);
      continue;
    }

    const step = STEPS.find((s) => s.step === nextStep);
    if (!step) continue;

    const daysSince = (now - new Date(lead.created_at).getTime()) / 86400000;
    if (daysSince < step.delayDays) {
      console.log(`⏳ ${lead.email}: faltan ${(step.delayDays - daysSince).toFixed(1)} días para correo #${nextStep}`);
      continue;
    }

    const body = step.content
      .replace(/{{nombre}}/g, lead.name || 'amigo')
      .replace(/{{freebie}}/g, lead.freebie_url || '')
      .replace(/{{enlace_oferta}}/g, OFFER_LINK);

    const subject = step.subject
      .replace(/{{nombre}}/g, lead.name || 'amigo');

    try {
      const result = await sendEmail({ to: lead.email, subject, body });
      console.log(`✉️  Correo #${nextStep} enviado a ${lead.email} | ID: ${result.id}`);
      await supabasePatch(lead.id, {
        current_step: nextStep,
        last_email_sent_at: new Date().toISOString(),
        status: nextStep >= STEPS.length ? 'completed' : 'active',
      });
      sent++;
    } catch (err) {
      console.error(`❌ Error con ${lead.email}: ${err.message}`);
    }
  }

  console.log(`\n📊 Resumen: ${sent} enviados de ${leads.length} leads activos.`);
}

main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
