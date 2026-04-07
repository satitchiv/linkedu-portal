// PATCH /api/update-recommendation
// Updates analyst_notes on a student_recommendations row.
// Auth: analyst only (X-Admin-Secret or Supabase JWT with analyst/admin role).
// A parent token cannot call this endpoint — analyst check is mandatory.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    // ── Analyst-only auth check ────────────────────────────────────────────────
    // Reuses isAuthorizedAnalyst: accepts X-Admin-Secret OR Supabase JWT with role=analyst/admin.
    // A parent access token (X-Access-Token) is deliberately not accepted here.
    const isAdmin = await isAuthorizedAnalyst(event)
    if (!isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analyst access required' }) }
    }

    const body = JSON.parse(event.body || '{}')
    const { rec_id, analyst_notes } = body

    if (!rec_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'rec_id is required' }) }
    if (analyst_notes === undefined) return { statusCode: 400, headers, body: JSON.stringify({ error: 'analyst_notes is required' }) }

    // ── Ownership check: confirm rec exists before updating ───────────────────
    const { data: rec, error: fetchErr } = await supabase
      .from('student_recommendations')
      .select('id, student_id')
      .eq('id', rec_id)
      .single()

    if (fetchErr || !rec) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Recommendation not found' }) }
    }

    // Update analyst_notes
    const { error: updateErr } = await supabase
      .from('student_recommendations')
      .update({ analyst_notes: analyst_notes || null })
      .eq('id', rec_id)

    if (updateErr) throw updateErr

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('update-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
