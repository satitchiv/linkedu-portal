// GET /api/line-chats?student_id=xxx
// Returns LINE chat history for a student — analysts only

const { createClient } = require('@supabase/supabase-js')

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

  try {
    // Auth: analyst JWT or admin secret
    const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    const isAdmin = secret && secret === process.env.ADMIN_SECRET

    if (!isAdmin) {
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

      const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('id', user.id).single()

      if (!profile || profile.role !== 'analyst') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
      }
    }

    const studentId = event.queryStringParameters && event.queryStringParameters.student_id
    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    const { data, error } = await supabase
      .from('line_chat_history')
      .select('id, parent_message, bot_reply, input_tokens, output_tokens, cost_usd, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ chats: data || [] }),
    }

  } catch (err) {
    console.error('line-chats error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
