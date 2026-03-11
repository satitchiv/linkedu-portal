// PATCH /api/update-student
// Updates parent-editable fields on the students table
// Requires: Supabase JWT in Authorization header

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Only these fields can be updated by a parent
const PARENT_EDITABLE = new Set([
  'student_name', 'preferred_name', 'dob', 'nationality',
  'current_school', 'current_year_group', 'curriculum', 'english_level',
  'primary_sport', 'goal', 'destination', 'budget_gbp', 'target_entry_year',
  'photo_url',
])

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    if (!profile || !profile.student_id) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No student linked to this account' }) }
    }

    const body = JSON.parse(event.body || '{}')

    // Filter to only parent-editable fields (analysts can update all)
    const updates = {}
    for (const [key, val] of Object.entries(body)) {
      if (profile.role === 'analyst' || PARENT_EDITABLE.has(key)) {
        updates[key] = val
      }
    }

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No valid fields to update' }) }
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('students')
      .update(updates)
      .eq('id', profile.student_id)
      .select()
      .single()

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student: data }) }

  } catch (err) {
    console.error('update-student error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
