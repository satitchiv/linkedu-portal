// GET /api/list-free-users
// Returns all free-tier user_profiles joined with saved_tool_results stats.
// Auth: X-Admin-Secret header OR Supabase JWT with analyst role

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret, X-Analyst-Pin',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // ── Auth: X-Admin-Secret OR Analyst PIN OR Supabase JWT analyst ───────────
    const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    const isAdmin = secret && secret === process.env.ADMIN_SECRET

    const analystPin = event.headers['x-analyst-pin'] || event.headers['X-Analyst-Pin']
    const isPinAuth  = analystPin && analystPin === process.env.ANALYST_PIN

    if (!isAdmin && !isPinAuth) {
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

    // ── Fetch all free users ──────────────────────────────────────────────────
    const { data: users, error: usersErr } = await supabase
      .from('user_profiles')
      .select('id, email, parent_name, created_at, account_type')
      .eq('account_type', 'free')
      .order('created_at', { ascending: false })

    if (usersErr) throw usersErr

    // ── Fetch all tool results ────────────────────────────────────────────────
    const { data: allTools, error: toolsErr } = await supabase
      .from('saved_tool_results')
      .select('user_id, tool_name, tool_label, updated_at')

    if (toolsErr) throw toolsErr

    // ── Join and compute engagement status ────────────────────────────────────
    const result = (users || []).map(u => {
      const userTools = (allTools || []).filter(t => t.user_id === u.id)
      const toolCount = userTools.length
      const toolNames = userTools.map(t => t.tool_label || t.tool_name)
      const lastActive = userTools.length > 0
        ? userTools.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0].updated_at
        : null
      const status = toolCount === 0 ? 'New' : toolCount <= 2 ? 'Exploring' : 'Engaged'
      return {
        id: u.id,
        email: u.email,
        parent_name: u.parent_name,
        created_at: u.created_at,
        account_type: u.account_type,
        tools_used: toolCount,
        tool_names: toolNames,
        last_active: lastActive,
        status,
      }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ users: result }),
    }

  } catch (err) {
    console.error('list-free-users error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    }
  }
}
