// PATCH /api/school-progress
// Updates latest_update and/or checklist on a student_schools row.
// Requires: X-Admin-Secret header
//
// Body: { student_school_id, latest_update?, checklist? }

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
  if (event.httpMethod !== 'PATCH') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { student_school_id, latest_update, checklist } = body

    if (!student_school_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_school_id is required' }) }
    }

    const updates = {}
    if (latest_update !== undefined) {
      updates.latest_update    = latest_update || null
      updates.latest_update_at = latest_update ? new Date().toISOString() : null
    }
    if (checklist !== undefined) {
      updates.checklist = checklist
    }

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No fields to update' }) }
    }

    const { data, error } = await supabase
      .from('student_schools')
      .update(updates)
      .eq('id', student_school_id)
      .select()
      .single()

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, school: data }) }

  } catch (err) {
    console.error('school-progress error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
