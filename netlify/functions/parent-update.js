// POST /api/parent-update
// Upserts a parent or analyst edit to any section/field
// Body: { section, field_key, field_value, notion_student_id (analysts only) }

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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    const body = JSON.parse(event.body || '{}')
    const { section, field_key, field_value, notion_student_id } = body

    if (!section || !field_key || field_value === undefined) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'section, field_key and field_value are required' }) }
    }

    // Determine target student
    const targetStudentId = (profile.role === 'analyst' && notion_student_id)
      ? notion_student_id
      : profile.notion_student_id

    // Non-analysts cannot edit other students
    if (profile.role !== 'analyst' && targetStudentId !== profile.notion_student_id) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    // Upsert — insert or update on conflict
    const { error } = await supabase
      .from('parent_updates')
      .upsert({
        notion_student_id: targetStudentId,
        section,
        field_key,
        field_value: typeof field_value === 'object' ? field_value : { value: field_value },
        updated_by: user.id,
        updated_by_role: profile.role,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'notion_student_id,section,field_key'
      })

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('parent-update error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
