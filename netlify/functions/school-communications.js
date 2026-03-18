// GET /api/school-communications?student_id=<uuid>
// Dual-auth: X-Access-Token (parent token) OR Supabase JWT (analyst/admin)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    // ── Path 1: X-Access-Token (parent token view) ────────────────────────────
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid access token' }) }
      }

      const { data: comms, error: fetchErr } = await supabase
        .from('school_communications')
        .select('*')
        .eq('student_id', student.id)
        .eq('visible_to_parent', true)
        .order('sent_at', { ascending: false })
      if (fetchErr) throw fetchErr

      return { statusCode: 200, headers, body: JSON.stringify({ communications: comms || [] }) }
    }

    // ── Path 2: Supabase JWT (analyst/admin) ──────────────────────────────────
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || !['analyst', 'admin'].includes(profile.role)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
    }

    const studentId = event.queryStringParameters && event.queryStringParameters.student_id
    if (!studentId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }
    }

    const { data: comms, error: fetchErr } = await supabase
      .from('school_communications')
      .select('*')
      .eq('student_id', studentId)
      .order('sent_at', { ascending: false })
    if (fetchErr) throw fetchErr

    return { statusCode: 200, headers, body: JSON.stringify({ communications: comms || [] }) }

  } catch (err) {
    console.error('school-communications error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
