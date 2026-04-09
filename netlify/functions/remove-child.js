// POST /api/remove-child
// Unlinks a child from the parent's account (removes parent_students row only).
// Does NOT delete the student record — the student and their data remain intact.
// Auth: Bearer JWT (parent only)
// Body: { student_id: "uuid" }

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { student_id } = JSON.parse(event.body || '{}')
    if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Verify the parent is actually linked to this student before removing
    const { data: link } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_user_id', user.id)
      .eq('student_id', student_id)
      .single()

    if (!link) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Child not linked to your account' }) }

    // Remove the link — student record and data are untouched
    const { error: delErr } = await supabase
      .from('parent_students')
      .delete()
      .eq('parent_user_id', user.id)
      .eq('student_id', student_id)

    if (delErr) throw delErr

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('remove-child error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
