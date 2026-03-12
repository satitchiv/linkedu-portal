// GET /api/students-list
// Returns all students from Supabase — analysts only
// Used by analyst golf entry app to populate student dropdown

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
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'analyst') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('id, student_name, preferred_name, notion_student_id')
      .order('student_name', { ascending: true })

    if (error) throw error

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        students: (students || []).map(s => ({
          id: s.id,
          notion_student_id: s.notion_student_id,
          name: s.preferred_name || s.student_name || 'Unknown',
        }))
      })
    }

  } catch (err) {
    console.error('students-list error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
