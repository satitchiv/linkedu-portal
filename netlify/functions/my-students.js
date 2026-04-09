// GET /api/my-students
// Returns all students linked to the authenticated parent via parent_students junction table.
// Auth: Bearer JWT (parent only)
// Used by the header child switcher — lightweight response, no deep data.

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

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    // Get all student IDs linked to this parent
    const { data: links, error: linksErr } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_user_id', user.id)

    if (linksErr) throw linksErr
    if (!links || links.length === 0) return { statusCode: 200, headers, body: JSON.stringify([]) }

    const studentIds = links.map(l => l.student_id)

    // Fetch lightweight student records
    const { data: students, error: studentsErr } = await supabase
      .from('students')
      .select('id, student_name, preferred_name, photo_url, stage, status')
      .in('id', studentIds)
      .order('student_name')

    if (studentsErr) throw studentsErr

    const result = (students || []).map(s => ({
      id:            s.id,
      studentName:   s.student_name   || '',
      preferredName: s.preferred_name || '',
      photoUrl:      s.photo_url      || null,
      stage:         s.stage          || '',
      status:        s.status         || 'active',
    }))

    return { statusCode: 200, headers, body: JSON.stringify(result) }

  } catch (err) {
    console.error('my-students error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
