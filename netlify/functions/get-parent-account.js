// GET /api/get-parent-account?student_id=<uuid>
// Analyst-only. Returns auth email + last sign-in for the parent linked to a student.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  if (!await isAuthorizedAnalyst(event))
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

  const student_id = (event.queryStringParameters || {}).student_id
  if (!student_id)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

  try {
    const { data: link } = await supabase
      .from('parent_students')
      .select('parent_user_id')
      .eq('student_id', student_id)
      .limit(1)
      .single()

    if (!link)
      return { statusCode: 200, headers, body: JSON.stringify({ hasAccount: false }) }

    const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(link.parent_user_id)
    if (userErr || !user)
      return { statusCode: 200, headers, body: JSON.stringify({ hasAccount: false }) }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        hasAccount:  true,
        email:       user.email,
        lastSignIn:  user.last_sign_in_at || null,
        createdAt:   user.created_at      || null,
      }),
    }
  } catch (err) {
    console.error('get-parent-account error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
