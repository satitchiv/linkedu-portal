// POST /api/analyst-add-child
// Analyst creates a new student and links them to all parents of the currently-viewed student.
// Auth: analyst JWT or X-Admin-Secret
// Body: { child_name, current_student_id }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    if (!await isAuthorizedAnalyst(event))
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { child_name, current_student_id } = JSON.parse(event.body || '{}')
    if (!child_name || !child_name.trim())
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'child_name required' }) }
    if (!current_student_id)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'current_student_id required' }) }

    const name        = child_name.trim()
    const accessToken = crypto.randomBytes(8).toString('hex')

    // Fetch parent details from the current student to copy to the new child
    const { data: currentStudent } = await supabase
      .from('students')
      .select('parent_name, parent_email, parent_phone')
      .eq('id', current_student_id)
      .single()

    // Create new student record — inherit parent contact info
    const { data: student, error: insertErr } = await supabase
      .from('students')
      .insert({
        student_name:      name,
        preferred_name:    name,
        access_token:      accessToken,
        status:            'prospect',
        created_by_parent: false,
        parent_name:       currentStudent?.parent_name  || null,
        parent_email:      currentStudent?.parent_email || null,
        parent_phone:      currentStudent?.parent_phone || null,
      })
      .select('id, student_name, preferred_name')
      .single()

    if (insertErr) throw insertErr

    // Find all parents linked to the current student
    const { data: parentLinks } = await supabase
      .from('parent_students')
      .select('parent_user_id')
      .eq('student_id', current_student_id)

    let linkedCount = 0
    if (parentLinks && parentLinks.length > 0) {
      for (const { parent_user_id } of parentLinks) {
        await supabase.from('parent_students').upsert(
          { parent_user_id, student_id: student.id },
          { onConflict: 'parent_user_id,student_id' }
        )
        linkedCount++
      }
    }

    // Notify Satit — non-blocking
    sendTelegram([
      'New child added by analyst',
      '',
      `Name: ${name}`,
      `Linked to ${linkedCount} parent(s) via student ${current_student_id}`,
      '',
      'Action: Fill in school pipeline in analyst view.',
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
        linkedCount,
      }),
    }
  } catch (err) {
    console.error('analyst-add-child error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
