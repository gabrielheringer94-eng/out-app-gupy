// ═══════════════════════════════════════════════════
// Gupy Pulse — Send Push Notifications
// Roda via GitHub Actions (segunda e sexta)
// ═══════════════════════════════════════════════════

const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

// Config
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:gabrielheringer94@gmail.com';
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_KEY;
const MESSAGE_TYPE      = process.env.MESSAGE_TYPE || 'auto';
const CUSTOM_TITLE      = process.env.CUSTOM_TITLE || '';
const CUSTOM_BODY       = process.env.CUSTOM_BODY  || '';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variáveis de ambiente faltando. Configure os GitHub Secrets.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Determine message type by day/time ──
function getMessageType() {
  if (MESSAGE_TYPE !== 'auto') return MESSAGE_TYPE;
  const now  = new Date();
  const utcH = now.getUTCHours();
  const dow  = now.getUTCDay(); // 0=Sun,1=Mon,...,5=Fri
  if (dow === 1 && utcH >= 10 && utcH <= 12) return 'forecast_reminder';
  if (dow === 5 && utcH >= 19 && utcH <= 21) return 'weekly_summary';
  return 'meeting_reminder';
}

// ── Build notification payload ──
function buildPayload(type, userName) {
  const firstName = userName ? userName.split(' ')[0] : 'BDR';

  if (type === 'forecast_reminder') {
    return {
      title: '📊 Forecast da semana',
      body: `${firstName}, você ainda não enviou seu forecast desta semana. Acesse o Gupy Pulse agora!`,
      tag: 'forecast',
      url: 'https://gabrielheringer94-eng.github.io/out-app-gupy/'
    };
  }

  if (type === 'weekly_summary') {
    return {
      title: '📈 Resumo da semana',
      body: `${firstName}, confira seu resultado da semana no Gupy Pulse. Boa sexta!`,
      tag: 'summary',
      url: 'https://gabrielheringer94-eng.github.io/out-app-gupy/'
    };
  }

  if (type === 'meeting_reminder') {
    return {
      title: '📅 Bom dia, confira sua agenda!',
      body: `${firstName}, verifique suas reuniões de hoje no Gupy Pulse.`,
      tag: 'meeting',
      url: 'https://gabrielheringer94-eng.github.io/out-app-gupy/'
    };
  }

  // custom
  return {
    title: CUSTOM_TITLE || '🔔 Gupy Pulse',
    body:  CUSTOM_BODY  || 'Nova atualização disponível.',
    tag:   'custom',
    url:   'https://gabrielheringer94-eng.github.io/out-app-gupy/'
  };
}

// ── Main ──
async function main() {
  const type = getMessageType();
  console.log(`📤 Tipo de notificação: ${type}`);

  // Fetch all subscriptions from Supabase
  const { data: subs, error } = await supabase
    .from('gp_push_subs')
    .select('user_id, user_name, subscription');

  if (error) {
    console.error('❌ Erro ao buscar subscriptions:', error.message);
    process.exit(1);
  }

  if (!subs || subs.length === 0) {
    console.log('⚠️  Nenhuma subscription encontrada. BDRs precisam ativar notificações no app.');
    return;
  }

  console.log(`📬 Enviando para ${subs.length} usuário(s)...`);

  let sent = 0, failed = 0;

  for (const sub of subs) {
    // Skip gestor (GESTOR id)
    if (sub.user_id === 'GESTOR') continue;

    const payload = buildPayload(type, sub.user_name);
    let subscription;

    try {
      subscription = JSON.parse(sub.subscription);
    } catch (e) {
      console.warn(`⚠️  Subscription inválida para ${sub.user_name}`);
      failed++;
      continue;
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log(`  ✓ ${sub.user_name || sub.user_id}`);
      sent++;
    } catch (e) {
      // 410 = subscription expired/unsubscribed — remove from DB
      if (e.statusCode === 410) {
        console.log(`  🗑  ${sub.user_name} — subscription expirada, removendo`);
        await supabase.from('gp_push_subs').delete().eq('user_id', sub.user_id);
      } else {
        console.warn(`  ✗ ${sub.user_name}: ${e.message}`);
      }
      failed++;
    }
  }

  console.log(`\n✅ Concluído: ${sent} enviados, ${failed} falhas.`);
}

main().catch(e => {
  console.error('❌ Erro fatal:', e);
  process.exit(1);
});
