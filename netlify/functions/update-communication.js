// PATCH /api/update-communication
// Analyst JWT only. Updates visibility, body text, subject, or sent_at.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

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
  if (event.httpMethod !== 'PATCH') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const { id, visible_to_parent, body_text, subject, sent_at } = JSON.parse(event.body || '{}')
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }

    const updates = {}
    if (visible_to_parent !== undefined) updates.visible_to_parent = visible_to_parent
    if (body_text !== undefined) updates.body_text = body_text
    if (subject !== undefined) updates.subject = subject
    if (sent_at !== undefined) updates.sent_at = sent_at

    if (Object.keys(updates).length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No fields to update' }) }
    }

    const { data, error } = await supabase
      .from('school_communications')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, communication: data }) }

  } catch (err) {
    console.error('update-communication error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
