// POST /api/approve-camp-recommendation
// Approves or unapproves a single camp recommendation. Analyst only.

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { id, approved, consultant_note } = JSON.parse(event.body || '{}')
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }

    const { error } = await supabase
      .from('student_camp_recommendations')
      .update({
        approved:        !!approved,
        approved_at:     approved ? new Date().toISOString() : null,
        consultant_note: consultant_note || null,
      })
      .eq('id', id)

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('approve-camp-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
