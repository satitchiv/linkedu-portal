// POST /api/set-highlighted-school
// Marks one recommendation as the highlighted (featured) school for a student's report.
// Clears highlighted on all other recs for the same student first.
// Body: { student_id, recommendation_id }
// Requires: X-Admin-Secret header

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
    const { student_id, recommendation_id } = JSON.parse(event.body || '{}')

    if (!student_id || !recommendation_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and recommendation_id required' }) }
    }

    // Clear highlighted on ALL recs for this student first
    await supabase
      .from('student_recommendations')
      .update({ highlighted: false })
      .eq('student_id', student_id)

    // Set highlighted on the chosen rec
    const { error } = await supabase
      .from('student_recommendations')
      .update({ highlighted: true })
      .eq('id', recommendation_id)
      .eq('student_id', student_id)  // safety: ensure rec belongs to this student

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('set-highlighted-school error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
