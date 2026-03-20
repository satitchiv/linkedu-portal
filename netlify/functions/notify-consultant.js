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
    const { topic, student_id } = JSON.parse(event.body || '{}')
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
