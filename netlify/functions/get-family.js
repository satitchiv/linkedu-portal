// GET /api/get-family?student_id=uuid
// Returns all sibling students — others linked to any shared parent of the given student.
// Auth: Bearer JWT (analyst/admin, or parent with access to this student)

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
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const student_id = (event.queryStringParameters || {}).student_id
    if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Check analyst / admin role
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
    const role = profile && profile[0] && profile[0].role
    const isAnalyst = role === 'analyst' || role === 'admin'

    if (!isAnalyst) {
      // Parent: verify they are linked to this student
      const { data: link } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_user_id', user.id)
        .eq('student_id', student_id)
        .single()
      if (!link) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Access denied' }) }
    }

    // Find all parents linked to this student
    const { data: parentLinks } = await supabase
      .from('parent_students')
      .select('parent_user_id')
      .eq('student_id', student_id)

    if (!parentLinks || parentLinks.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ siblings: [] }) }
    }

    const parentIds = parentLinks.map(p => p.parent_user_id)

    // Find all other students linked to those same parents
    const { data: siblingLinks } = await supabase
      .from('parent_students')
      .select('student_id')
      .in('parent_user_id', parentIds)
      .neq('student_id', student_id)

    if (!siblingLinks || siblingLinks.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ siblings: [] }) }
    }

    const siblingIds = [...new Set(siblingLinks.map(s => s.student_id))]

    const { data: siblings } = await supabase
      .from('students')
      .select('id, student_name, preferred_name, status, stage')
      .in('id', siblingIds)
      .order('student_name')

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        siblings: (siblings || []).map(s => ({
          id:            s.id,
          studentName:   s.student_name   || '',
          preferredName: s.preferred_name || '',
          status:        s.status || '',
          stage:         s.stage  || '',
        }))
      }),
    }
  } catch (err) {
    console.error('get-family error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
