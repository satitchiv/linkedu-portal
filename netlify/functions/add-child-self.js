// POST /api/add-child-self
// Auth: Bearer JWT (parent only)
// Body: { preferredName, fullName? }
// Creates a new student record, links to parent, notifies Satit via Telegram.

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const https  = require('https')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return Promise.resolve()
  const body = JSON.stringify({ chat_id: chatId, text: message })
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.on('data', () => {}); res.on('end', resolve) })
    req.on('error', resolve)
    req.write(body)
    req.end()
  })
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { preferredName, fullName } = JSON.parse(event.body || '{}')
    if (!preferredName || !preferredName.trim())
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Child name required' }) }

    const name        = preferredName.trim()
    const studentName = (fullName || '').trim() || name
    const accessToken = crypto.randomBytes(8).toString('hex')

    // Create student record
    const { data: student, error: insertErr } = await supabase
      .from('students')
      .insert({
        student_name:      studentName,
        preferred_name:    name,
        access_token:      accessToken,
        parent_email:      user.email || '',
        status:            'prospect',
        created_by_parent: true,
      })
      .select('id, student_name, preferred_name')
      .single()

    if (insertErr) throw insertErr

    // Link to parent in junction table
    await supabase.from('parent_students').upsert({
      parent_user_id: user.id,
      student_id:     student.id,
    }, { onConflict: 'parent_user_id,student_id' })

    // Propagate LINE user ID from any sibling that already has one
    const { data: siblings } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_user_id', user.id)
      .neq('student_id', student.id)
    if (siblings && siblings.length > 0) {
      const { data: sibWithLine } = await supabase
        .from('students')
        .select('line_user_id')
        .in('id', siblings.map(s => s.student_id))
        .not('line_user_id', 'is', null)
        .limit(1)
        .single()
      if (sibWithLine && sibWithLine.line_user_id) {
        await supabase.from('students')
          .update({ line_user_id: sibWithLine.line_user_id })
          .eq('id', student.id)
      }
    }

    // Notify Satit via Telegram — non-blocking
    sendTelegram([
      'New child added by parent',
      '',
      `Name: ${name}`,
      `Parent email: ${user.email}`,
      '',
      'Action: Open analyst view → Students → fill in school pipeline.',
    ].join('\n')).catch(() => {})

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        student: {
          id:            student.id,
          studentName:   student.student_name   || '',
          preferredName: student.preferred_name || '',
        },
      }),
    }
  } catch (err) {
    console.error('add-child-self error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
