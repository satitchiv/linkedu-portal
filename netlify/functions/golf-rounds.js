// GET  /api/golf-rounds?student_id=xxx  — fetch rounds
// POST /api/golf-rounds                  — save a round
// Requires: Supabase JWT in Authorization header

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

  try {
    // Verify Supabase JWT
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    // Get user profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    // GET — fetch rounds
    if (event.httpMethod === 'GET') {
      const studentId = event.queryStringParameters?.student_id || profile.notion_student_id

      // Non-analysts can only fetch their own student's rounds
      if (profile.role !== 'analyst' && studentId !== profile.notion_student_id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
      }

      const { data: rounds, error } = await supabase
        .from('golf_rounds')
        .select('*')
        .eq('notion_student_id', studentId)
        .order('date', { ascending: false })

      if (error) throw error

      return { statusCode: 200, headers, body: JSON.stringify({ rounds }) }
    }

    // POST — save a round
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const { notion_student_id, ...roundData } = body

      // Non-analysts can only save for themselves
      const targetStudentId = notion_student_id || profile.notion_student_id
      if (profile.role !== 'analyst' && targetStudentId !== profile.notion_student_id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
      }

      const { data, error } = await supabase
        .from('golf_rounds')
        .insert({
          notion_student_id: targetStudentId,
          entered_by_id: user.id,
          entered_by_role: profile.role,
          ...roundData
        })
        .select()
        .single()

      if (error) throw error

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, round: data }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  } catch (err) {
    console.error('golf-rounds error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
