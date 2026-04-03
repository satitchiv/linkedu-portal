// DELETE /api/delete-free-user
// Removes a free-tier user: user_profiles row, saved_tool_results, and Supabase auth user.
// Auth: Supabase JWT with analyst role required.

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    // Auth — analyst JWT only
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'analyst') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
    }

    const { user_id } = JSON.parse(event.body || '{}')
    if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id required' }) }

    // Verify target is a free user (never delete clients/students)
    const { data: targetProfile } = await supabase
      .from('user_profiles').select('account_type').eq('id', user_id).single()
    if (!targetProfile || targetProfile.account_type !== 'free') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Can only delete free accounts' }) }
    }

    // Delete saved tool results
    await supabase.from('saved_tool_results').delete().eq('user_id', user_id)

    // Delete user_profiles row
    await supabase.from('user_profiles').delete().eq('id', user_id)

    // Delete Supabase auth user
    await supabase.auth.admin.deleteUser(user_id)

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('delete-free-user error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
