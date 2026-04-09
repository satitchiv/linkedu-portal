// POST /api/add-child-by-token
// Parent links an additional child to their account using the child's portal token.
// Auth: Bearer JWT (parent only)
// Body: { token: "abc123" }

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

    const { token: childToken } = JSON.parse(event.body || '{}')
    if (!childToken)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Token required' }) }

    // Look up the student by their portal access token
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .select('id, student_name, preferred_name')
      .eq('access_token', childToken)
      .single()

    if (stuErr || !student)
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Token not found — check the link and try again' }) }

    // Check if already linked
    const { data: existing } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_user_id', user.id)
      .eq('student_id', student.id)
      .single()

    if (existing)
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'This child is already linked to your account' }) }

    // Link the child
    const { error: insertErr } = await supabase
      .from('parent_students')
      .upsert({ parent_user_id: user.id, student_id: student.id }, { onConflict: 'parent_user_id,student_id' })

    if (insertErr) throw insertErr

    // Propagate LINE user ID from any sibling that already has one
    if (!student.line_user_id) {
      const { data: siblings } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_user_id', user.id)
        .neq('student_id', student.id)
      if (siblings && siblings.length > 0) {
        const { data: sibWithLine } = await supabase
          .from('students')
          .select('line_user_id')
          .in('id', siblings.map(s => s.student_id))
          .not('line_user_id', 'is', null)
          .limit(1)
          .single()
        if (sibWithLine && sibWithLine.line_user_id) {
          await supabase.from('students')
            .update({ line_user_id: sibWithLine.line_user_id })
            .eq('id', student.id)
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        student: {
          id:            student.id,
          studentName:   student.student_name   || '',
          preferredName: student.preferred_name || '',
        },
      }),
    }
  } catch (err) {
    console.error('add-child-by-token error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
