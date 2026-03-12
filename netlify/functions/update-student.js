// PATCH /api/update-student
// Updates fields on the students table
// Auth: X-Admin-Secret (analyst, all fields, student_id in body) OR Supabase JWT (parent, restricted fields)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Only these fields can be updated by a parent via JWT
const PARENT_EDITABLE = new Set([
  'student_name', 'preferred_name', 'dob', 'nationality',
  'current_school', 'current_year_group', 'curriculum', 'english_level',
  'primary_sport', 'goal', 'destination', 'budget_gbp', 'target_entry_year',
  'photo_url',
  'parent_name', 'parent_email', 'parent_phone',
])

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
    const body = JSON.parse(event.body || '{}')
    const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    const isAdmin = secret && secret === process.env.ADMIN_SECRET

    // ── Admin path: all fields allowed, student_id required in body ──
    if (isAdmin) {
      const { student_id, ...fields } = body
      if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id is required' }) }

      const updates = { ...fields, updated_at: new Date().toISOString() }
      if (Object.keys(fields).length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No fields to update' }) }
      }

      const { data, error } = await supabase
        .from('students').update(updates).eq('id', student_id).select().single()

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student: data }) }
    }

    // ── Parent path: JWT required, restricted fields only ──
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    if (!profile || !profile.student_id) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No student linked to this account' }) }
    }

    const updates = {}
    for (const [key, val] of Object.entries(body)) {
      if (PARENT_EDITABLE.has(key)) updates[key] = val
    }

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid fields to update' }) }
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('students').update(updates).eq('id', profile.student_id).select().single()

    if (error) throw error
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student: data }) }

  } catch (err) {
    console.error('update-student error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
