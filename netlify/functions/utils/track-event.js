// Shared funnel event tracking helper.
// Silent fail — analytics must never block the main flow.

const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function trackEvent(userId, eventName, properties = {}) {
  try {
    await sb.from('funnel_events').insert({
      user_id: userId,
      event_name: eventName,
      properties,
    })
  } catch (e) {
    console.error('trackEvent error:', e.message)
  }
}

module.exports = { trackEvent }
