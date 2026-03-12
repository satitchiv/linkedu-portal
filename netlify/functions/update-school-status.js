// PATCH /api/update-school-status
// Updates application_status and/or deadline for a student_schools row
// Requires: X-Admin-Secret header
// Body: { student_school_id, application_status?, deadline? }

const { createClient } = require('@supabase/supabase-js')

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

  const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { student_school_id, application_status, deadline } = body

    if (!student_school_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_school_id is required' }) }
    }

    const updates = {}
    if (application_status !== undefined) updates.application_status = application_status
    if (deadline !== undefined) updates.deadline = deadline || null

    if (!Object.keys(updates).length) {
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
    console.error('update-school-status error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
