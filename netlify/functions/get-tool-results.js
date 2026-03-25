// GET /api/get-tool-results
// Returns all saved tool results for the authenticated user.
// Auth: Bearer JWT (Supabase JWT from sb.auth.getSession())

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: results, error: fetchErr } = await supabase
      .from('saved_tool_results')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (fetchErr) {
      console.error('get-tool-results fetch error:', fetchErr)
      return { statusCode: 500, headers, body: JSON.stringify({ error: fetchErr.message }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ results: results || [] }) }

  } catch (err) {
    console.error('get-tool-results error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
