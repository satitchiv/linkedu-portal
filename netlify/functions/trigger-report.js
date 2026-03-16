// POST /api/trigger-report
// Analyst-only. Fetches a student's recommendations and sends a pre-formed
// run-report.sh command to Satit via Telegram.
// Body: { studentId: "uuid" }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
const https = require('https')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID

function calcAge(dob, targetYearGroup) {
  if (dob) {
    const birthYear = new Date(dob).getFullYear()
    return new Date().getFullYear() - birthYear
  }
  if (targetYearGroup) {
    const match = String(targetYearGroup).match(/\d+/)
    if (match) return parseInt(match[0]) + 4
  }
  return 13
}

function tgSend(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' })
    const req  = https.request({
      hostname: 'api.telegram.org',
      path:     `/bot${BOT_TOKEN}/sendMessage`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(body); req.end()
  })
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { studentId } = JSON.parse(event.body || '{}')
    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'studentId required' }) }

    // Fetch student
    const { data: s, error: sErr } = await supabase
      .from('students')
      .select('id,student_name,preferred_name,dob,target_year_group,primary_sport,goal,budget_gbp,english_level,parent_name')
      .eq('id', studentId)
      .single()

    if (sErr || !s) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }

    // Fetch approved recommendations only — analyst must approve before report is built
    const { data: recs, error: rErr } = await supabase
      .from('student_recommendations')
      .select('school_name,score,approved')
      .eq('student_id', studentId)
      .eq('approved', true)
      .order('score', { ascending: false })

    if (rErr) throw rErr

    if (!recs || !recs.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No approved schools yet. Use "Show to Parent" on the recommendations first.' }) }
    }

    const name    = s.preferred_name || s.student_name
    const parent  = s.parent_name || 'Parent'
    const age     = calcAge(s.dob, s.target_year_group)
    const sport   = s.primary_sport || 'none'
    const goal    = s.goal || 'general'
    const budget  = s.budget_gbp || 'none'
    const eng     = s.english_level || 'none'
    const pinned  = recs.map(r => `"${r.school_name}"`).join(' ')

    const command = `bash /Users/moodygarlic/.openclaw/skills/user/run-report.sh "${parent}" "${name}" ${age} "UK" "any" "${goal}" "${sport}" "${budget}" "${eng}" "above_average" ${pinned}`

    const schoolList = recs.map(r => {
      const tag = r.score === 0 ? '[advisor]' : `[${r.score}]`
      return `  ${tag} ${r.school_name}`
    }).join('\n')

    const msg =
      `<b>Report requested — ${name}</b>\n` +
      `${recs.length} school${recs.length !== 1 ? 's' : ''} pinned\n\n` +
      `<b>Schools:</b>\n${schoolList}\n\n` +
      `<b>Run this in OpenClaw:</b>\n<code>${command}</code>`

    if (BOT_TOKEN && CHAT_ID) {
      await tgSend(msg)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        student: name,
        schoolCount: recs.length,
        command,
        telegramSent: !!(BOT_TOKEN && CHAT_ID),
      }),
    }

  } catch (err) {
    console.error('trigger-report error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
