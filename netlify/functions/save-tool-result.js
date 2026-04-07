// POST /api/save-tool-result
// Saves (upserts) a tool result for the authenticated user.
// Auth: Bearer JWT (Supabase JWT from sb.auth.getSession())
// Body: { tool_name, tool_label, result_summary, result_data }

const { createClient } = require('@supabase/supabase-js')
const { trackEvent } = require('./utils/track-event')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { tool_name, tool_label, result_summary, result_data } = JSON.parse(event.body || '{}')

    if (!tool_name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'tool_name required' }) }

    const { data: upsertData, error: upsertErr } = await supabase
      .from('saved_tool_results')
      .upsert(
        {
          user_id: user.id,
          tool_name,
          tool_label: tool_label || null,
          result_summary: result_summary || null,
          result_data: result_data || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tool_name' }
      )
      .select('created_at, updated_at')

    if (upsertErr) {
      console.error('save-tool-result upsert error:', upsertErr)
      return { statusCode: 500, headers, body: JSON.stringify({ error: upsertErr.message }) }
    }

    const row = upsertData && upsertData[0]
    const isFirstSave = row ? row.created_at === row.updated_at : false
    await trackEvent(user.id, 'tool_saved', {
      tool_name,
      tool_label: tool_label || null,
      is_first_save: isFirstSave,
    })

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('save-tool-result error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
