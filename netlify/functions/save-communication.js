// POST /api/save-communication
// Analyst JWT only. Logs a new email exchange for a student.

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const {
      student_id,
      school_name,
      direction,
      body_text,
      subject,
      sent_at,
      student_school_id,
      created_by,
      gmail_message_id,
    } = JSON.parse(event.body || '{}')

    if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }
    if (!school_name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'school_name required' }) }
    if (!direction) return { statusCode: 400, headers, body: JSON.stringify({ error: 'direction required' }) }
    if (!body_text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'body_text required' }) }
    if (!['outbound', 'inbound'].includes(direction)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'direction must be outbound or inbound' }) }
    }

    const row = {
      student_id,
      school_name,
      direction,
      body_text,
      visible_to_parent: false,
      subject: subject || null,
      sent_at: sent_at || new Date().toISOString(),
      student_school_id: student_school_id || null,
      created_by: created_by || null,
      gmail_message_id: gmail_message_id || null,
    }

    const { data, error } = await supabase
      .from('school_communications')
      .insert(row)
      .select()
      .single()
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, communication: data }) }

  } catch (err) {
    console.error('save-communication error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
