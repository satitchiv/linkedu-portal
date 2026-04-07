// PATCH /api/update-free-user
// Updates contacted status or free_notes for a free user.
// Body: { user_id, contacted?, free_notes? }
// Auth: Supabase JWT with analyst role.

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
  if (event.httpMethod !== 'PATCH') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'analyst') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
    }

    const { user_id, contacted, free_notes } = JSON.parse(event.body || '{}')
    if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id required' }) }

    const updates = {}
    if (contacted !== undefined) updates.contacted = contacted
    if (free_notes !== undefined) updates.free_notes = free_notes

    if (!Object.keys(updates).length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nothing to update' }) }
    }

    const { error: updateErr } = await supabase
      .from('user_profiles').update(updates).eq('id', user_id).eq('account_type', 'free')

    if (updateErr) throw updateErr

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('update-free-user error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
