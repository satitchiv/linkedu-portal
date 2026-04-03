// POST /api/notify-consultant
// Sends a Telegram notification to the consultant when a parent requests contact.
// Auth: X-Access-Token (token/parent view) OR analyst JWT

const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    })
    const req = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { topic, student_id, direct_message, free_contact } = JSON.parse(event.body || '{}')

    // ── Free user contact request path ────────────────────────────────────────
    if (free_contact) {
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      const { data: profile } = await supabase
        .from('user_profiles').select('role, email, parent_name, account_type').eq('id', user.id).single()
      if (!profile || profile.account_type !== 'free') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Free accounts only' }) }
      }
      // Flag contact requested
      await supabase.from('user_profiles').update({ contact_requested: true }).eq('id', user.id)
      // Notify via Telegram
      const msg = `<b>LINKEDU — Free User Contact Request</b>\n\n<b>Email:</b> ${profile.email}\n<b>Name:</b> ${profile.parent_name || '—'}\n<b>Re:</b> ${topic || 'General enquiry'}`
      await sendTelegram(msg)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    // ── Direct message path (for free users, admin secret OR analyst JWT) ────
    if (direct_message) {
      const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
      const isAdminDirect = secret && secret === process.env.ADMIN_SECRET
      if (!isAdminDirect) {
        // Also allow analyst JWT
        const token = (event.headers.authorization || '').replace('Bearer ', '')
        if (token) {
          const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
          if (authErr || !user) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
          }
          const { data: profile } = await supabase
            .from('user_profiles').select('role').eq('id', user.id).single()
          if (!profile || profile.role !== 'analyst') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
          }
        } else {
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
        }
      }
      await sendTelegram(`<b>LINKEDU — Free User Alert</b>\n\n${direct_message}`)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    if (!topic) return { statusCode: 400, headers, body: JSON.stringify({ error: 'topic is required' }) }

    // ── Resolve student ──────────────────────────────────────────────────────
    let student = null
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']

    if (accessToken) {
      // Parent/token view
      const { data, error } = await supabase
        .from('students').select('*').eq('access_token', accessToken).single()
      if (error || !data) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      student = data
    } else if (student_id) {
      // Analyst view (testing)
      const { data, error } = await supabase
        .from('students').select('*').eq('id', student_id).single()
      if (error || !data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }
      student = data
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No student identified' }) }
    }

    const phone       = student.parent_phone || ''
    const parentName  = student.parent_name  || 'Parent'
    const studentName = student.student_name || 'Student'

    if (!phone)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'no_phone' }) }

    const msg =
      `<b>LINKEDU — Contact Request</b>\n\n` +
      `<b>Student:</b> ${studentName}\n` +
      `<b>Parent:</b> ${parentName}\n` +
      `<b>Phone:</b> ${phone}\n` +
      `<b>Re:</b> ${topic}`

    await sendTelegram(msg)
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('notify-consultant error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
