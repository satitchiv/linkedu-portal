// POST /api/track-event
// Browser-facing endpoint for client-side funnel events (portal_visited, tool_save_completed).
// Auth: Bearer JWT (Supabase access token)
// Body: { event_name, properties }
// Always returns { ok: true } — never blocks the caller.

const { createClient } = require('@supabase/supabase-js')
const { trackEvent } = require('./utils/track-event')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

    const { event_name, properties } = JSON.parse(event.body || '{}')
    if (event_name) {
      await trackEvent(user.id, event_name, properties || {})
    }
  } catch (e) {
    console.error('track-event handler error:', e.message)
  }

  // Always 200 — never expose analytics errors to the client
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
}
