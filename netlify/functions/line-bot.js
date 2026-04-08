// LinkedU LINE parent bot — Claude Haiku powered
// Verified parents only — whitelist enforced via line_user_id in students table
// Reactive model: all replies use replyToken (free). Push used only for follow event.
// Cost: ~$1/month at 20 families. Strangers cost zero — no AI called.

const { createClient } = require('@supabase/supabase-js')
const https  = require('https')
const crypto = require('crypto')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const LINE_ACCESS_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN
const LINE_SECRET        = process.env.LINE_CHANNEL_SECRET
const BOT_TOKEN          = process.env.TELEGRAM_BOT_TOKEN
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY

// ── Signature verification ─────────────────────────────────────────────────────
function verifySignature(rawBody, signature) {
  if (!LINE_SECRET || !signature) return false
  const hash = crypto.createHmac('SHA256', LINE_SECRET).update(rawBody).digest('base64')
  return hash === signature
}

// ── LINE API helpers ───────────────────────────────────────────────────────────
function linePost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.line.me',
      path: `/v2/bot/message/${path}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let b = ''; res.on('data', c => b += c)
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch(e) { resolve({}) } })
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}

// Reply to a message using its replyToken — FREE, no quota used
function reply(replyToken, text) {
  return linePost('reply', {
    replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 4999) }],
  })
}

// Push a message to a user proactively — costs against 200/month free quota
// V1: only used for follow event welcome message
function push(userId, text) {
  return linePost('push', {
    to: userId,
    messages: [{ type: 'text', text: String(text).slice(0, 4999) }],
  })
}

// ── Telegram helper (for consultant callback alerts) ──────────────────────────
function tgSend(chatId, text) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => { res.on('data', () => {}); res.on('end', resolve) })
    req.on('error', resolve) // non-fatal
    req.write(data); req.end()
  })
}

// ── Bangkok time helper ────────────────────────────────────────────────────────
function bangkokDateStr() {
  // UTC+7 offset — avoids daylight saving issues (Thailand doesn't observe DST)
  const bangkokNow = new Date(Date.now() + 7 * 60 * 60 * 1000)
  return bangkokNow.toISOString().split('T')[0] // YYYY-MM-DD in Bangkok time
}

// ── Rate limit ─────────────────────────────────────────────────────────────────
async function checkAndIncrementRateLimit(student) {
  const today = bangkokDateStr()
  const resetDate = student.line_daily_reset
  const count = student.line_daily_count || 0

  if (!resetDate || resetDate < today) {
    // New day — reset counter
    await supabase.from('students')
      .update({ line_daily_count: 1, line_daily_reset: today })
      .eq('id', student.id)
    return true
  }

  if (count >= 20) return false // blocked

  await supabase.from('students')
    .update({ line_daily_count: count + 1 })
    .eq('id', student.id)
  return true
}

// ── Student context builder ────────────────────────────────────────────────────
async function buildParentContext(studentId) {
  const today = bangkokDateStr()
  const [studentRes, schoolsRes, timelineRes, recsRes] = await Promise.all([
    supabase.from('students')
      .select('id, student_name, preferred_name, target_entry_year, target_year_group, stage, parent_name, parent_phone')
      .eq('id', studentId).single(),

    supabase.from('student_schools')
      .select('school_name, application_status, priority')
      .eq('student_id', studentId)
      .neq('application_status', 'abandoned')
      .order('priority'),

    supabase.from('school_timeline_items')
      .select('title, item_type, date, notes')
      .eq('student_id', studentId)
      .gte('date', today)
      .order('date')
      .limit(5),

    supabase.from('student_recommendations')
      .select('school_name, score, tier')
      .eq('student_id', studentId)
      .eq('approved', true)
      .order('score', { ascending: false }),
  ])

  return {
    student:          studentRes.data  || {},
    schools:          schoolsRes.data  || [],
    upcomingDeadlines: timelineRes.data || [],
    recommendations:  recsRes.data     || [],
  }
}

// ── Format context as text for Gemini system prompt ───────────────────────────
function formatContext(ctx) {
  const { student, schools, upcomingDeadlines, recommendations } = ctx
  const name = student.preferred_name || student.student_name || 'the student'

  const schoolLines = schools.length
    ? schools.map(s => `  - ${s.school_name}: ${s.application_status}`).join('\n')
    : '  (no schools added yet)'

  const deadlineLines = upcomingDeadlines.length
    ? upcomingDeadlines.map(d => `  - ${d.date}: ${d.title} — ${d.item_type}${d.notes ? ` (${d.notes})` : ''}`).join('\n')
    : '  (no upcoming deadlines)'

  const recLines = recommendations.length
    ? recommendations.map(r => `  - ${r.school_name} (tier: ${r.tier || '-'})`).join('\n')
    : '  (no recommendations yet)'

  return `
Student: ${name}
Target entry: ${student.target_year_group || '?'} in ${student.target_entry_year || '?'}

Schools in pipeline:
${schoolLines}

Upcoming deadlines:
${deadlineLines}

Recommended schools:
${recLines}
`.trim()
}

// ── Claude Haiku API call ─────────────────────────────────────────────────────
function callClaude(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = ''
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body)
          const text = parsed.content && parsed.content[0] && parsed.content[0].text
          resolve(text || '')
        } catch (e) {
          reject(new Error('Claude parse error: ' + body.slice(0, 200)))
        }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// ── Process message through Claude Haiku ─────────────────────────────────────
async function processWithClaude(replyToken, userMessage, ctx) {
  const studentName = ctx.student.preferred_name || ctx.student.student_name || 'the student'
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const systemPrompt = `You are LINKEDU's assistant, chatting with the parent of ${studentName} on LINE.
Today: ${today}

Rules:
- 3-5 lines max. This is LINE chat, not email.
- No markdown. No **, no bullets, no dashes.
- Max 3 items in any list. Say "and a few others" if more.
- No fees unless asked.
- Don't end every reply with a question.
- Match parent's language. Thai → Thai. English → English. Never mix.
- Warm and casual. Sound like a person, not a brochure.

Student data:
${formatContext(ctx)}`

  try {
    const text = await callClaude(systemPrompt, userMessage)
    if (text) return reply(replyToken, text)
    return reply(replyToken, 'Sorry, I didn\'t catch that. Please try again.')
  } catch (err) {
    console.error('Claude error:', err.message)
    return reply(replyToken, 'Sorry, I ran into a technical issue. Please try again in a moment.')
  }
}

// ── Tool action handlers ───────────────────────────────────────────────────────
function actionGetStatus(replyToken, ctx) {
  const { schools, student } = ctx
  const name = student.preferred_name || student.student_name

  if (!schools.length) {
    return reply(replyToken, `No schools have been added to ${name}'s application yet. Your consultant will update this soon.`)
  }

  const STAGE_EMOJI = {
    researching: 'Researching',
    applied:     'Applied',
    interview:   'Interview',
    offer:       'Offer received',
    visit:       'Visit scheduled',
    accepted:    'Accepted',
    visa:        'Visa stage',
    tb_test:     'TB test',
    guardianship: 'Guardianship',
    enrolled:    'Enrolled',
  }

  const lines = schools.map(s => {
    const stage = STAGE_EMOJI[s.application_status] || s.application_status
    const update = s.latest_update ? `\n    Last update: ${s.latest_update}` : ''
    return `${s.school_name}\n  Stage: ${stage}${update}`
  })

  const text = `${name}'s Applications\n\n${lines.join('\n\n')}`
  return reply(replyToken, text)
}

function actionGetDeadlines(replyToken, ctx) {
  const { upcomingDeadlines, student } = ctx
  const name = student.preferred_name || student.student_name

  if (!upcomingDeadlines.length) {
    return reply(replyToken, `No upcoming deadlines found for ${name}. Your consultant will add them as applications progress.`)
  }

  const lines = upcomingDeadlines.map(d => {
    const date = new Date((d.date || d.due_date) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${date} · ${d.title || d.school_name} — ${d.item_type}${d.notes ? ` (${d.notes})` : ''}`
  })

  return reply(replyToken, `Upcoming deadlines for ${name}:\n\n${lines.join('\n')}`)
}

function actionGetSchoolDetail(replyToken, ctx, schoolName) {
  const { recommendations } = ctx
  if (!recommendations.length) {
    return reply(replyToken, 'No school recommendations have been approved for your child yet. Your consultant will share these soon.')
  }

  const match = recommendations.find(r =>
    r.school_name.toLowerCase().includes((schoolName || '').toLowerCase())
  ) || recommendations[0]

  const fee = match.fee ? `£${match.fee.toLocaleString()}/year` : 'Contact consultant'
  const reasons = (match.match_reasons || []).slice(0, 3).join(', ')
  const note = match.consultant_note ? `\n\nConsultant note: ${match.consultant_note}` : ''

  const text = `${match.school_name}\n\nTier: ${match.tier || '-'}\nAnnual fee: ${fee}\nWhy it suits ${ctx.student.preferred_name || ctx.student.student_name}: ${reasons || 'See portal for details'}${note}`
  return reply(replyToken, text)
}

async function actionRequestCallback(replyToken, ctx) {
  const { student } = ctx
  const name = student.preferred_name || student.student_name
  const parentName = student.parent_name || 'Parent'

  // Notify consultant via Telegram — do NOT write to student record (would corrupt portal updates)
  if (BOT_TOKEN) {
    const allowedIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const id of allowedIds) {
      await tgSend(id, `<b>Callback requested via LINE</b>\n${parentName} (${name}'s parent) would like a call.\n\nPhone: ${student.parent_phone || 'not on file'}`)
    }
  }

  return reply(replyToken,
    'Done — your consultant has been notified and will call you as soon as possible.\n\n' +
    'If urgent, you can also reach us directly at the number your consultant shared with you.'
  )
}

// ── Main handler ───────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // LINE always expects 200 — never return 4xx (triggers retries → duplicate messages)
  const OK = { statusCode: 200, body: 'ok' }

  if (event.httpMethod !== 'POST') return OK

  const isBase64 = event.isBase64Encoded === true
  const rawBody  = isBase64 ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '')
  const signature = event.headers['x-line-signature'] || event.headers['X-Line-Signature'] || ''

  console.log('LINE webhook received — isBase64:', isBase64, 'sig present:', !!signature, 'body length:', rawBody.length)

  // Verify webhook signature
  const sigOk = verifySignature(rawBody, signature)
  console.log('LINE signature valid:', sigOk)
  if (!sigOk) return OK

  let payload
  try { payload = JSON.parse(rawBody) } catch(e) { return OK }

  const events = payload.events || []

  for (const ev of events) {
    try {
      await handleEvent(ev)
    } catch(e) {
      console.error('LINE bot error:', e.message, e.stack)
    }
  }

  return OK
}

async function handleEvent(ev) {
  const lineUserId  = ev.source && ev.source.userId
  const replyToken  = ev.replyToken
  const evType      = ev.type

  if (!lineUserId) return

  // ── Follow event — parent adds the LINE OA as friend ──────────────────────
  // push() used here — costs 1 against 200/month free quota
  // This is the ONLY place push() is called automatically in V1
  if (evType === 'follow') {
    await push(lineUserId,
      'Welcome to LINKEDU.\n\n' +
      'This is a private service for our families.\n\n' +
      'To link your account, please use the activation link your consultant sent you. ' +
      'Tap the link, then tap Send in LINE — your account will be linked automatically.'
    )
    return
  }

  // ── Unfollow event — V1: ignore (line_user_id stays in DB) ────────────────
  // V2: clear line_user_id so re-adding triggers fresh link flow
  if (evType === 'unfollow') return

  // ── Only handle message and postback events from here ────────────────────
  if (evType !== 'message' && evType !== 'postback') return
  if (!replyToken) return

  // Extract text from message or postback
  let text = ''
  if (evType === 'message') {
    if (ev.message && ev.message.type === 'text') {
      text = (ev.message.text || '').trim()
    } else {
      // Non-text message (image, sticker, etc.) — prompt for text
      await reply(replyToken, 'Please type your question or tap a button in the menu below.')
      return
    }
  } else if (evType === 'postback') {
    const data = ev.postback && ev.postback.data
    // Handle canned postbacks before whitelist check (they don't need student data)
    if (data === 'action=documents') {
      await reply(replyToken,
        'To share documents with your consultant:\n\n' +
        '1. Email to satit@linkedu.hk\n' +
        '2. Or share via Google Drive and paste the link here\n\n' +
        'Your consultant will confirm receipt within 24 hours.'
      )
      return
    }
    if (data === 'action=ask') {
      await reply(replyToken, 'Go ahead — type your question and I\'ll answer it.')
      return
    }
    // Map other postbacks to natural language queries
    const postbackMap = {
      'action=status':    'What is the current application status for my child?',
      'action=deadlines': 'What are the upcoming deadlines for my child?',
      'action=schools':   'Tell me about our shortlisted and recommended schools.',
      'action=contact':   'I would like my consultant to call me.',
    }
    text = postbackMap[data] || ''
    if (!text) {
      await reply(replyToken, 'I didn\'t understand that. Please type your question.')
      return
    }
  }

  if (!text) return

  // ── Token verification flow ───────────────────────────────────────────────
  // Parent sends "token:XXXXXXXX" — links their LINE ID to their student record
  if (text.toLowerCase().startsWith('token:')) {
    const token = text.slice(6).trim()
    console.log('LINE token attempt:', { token: token.slice(0,4)+'...', lineUserId: lineUserId.slice(0,6)+'...' })
    const { data: match } = await supabase
      .from('students')
      .select('id, student_name, preferred_name, line_user_id')
      .eq('access_token', token)
      .single()

    console.log('LINE token match:', match ? match.student_name : 'NOT FOUND')

    if (!match) {
      await reply(replyToken, 'That activation code was not recognised. Please ask your consultant for a fresh code.')
      return
    }

    if (match.line_user_id && match.line_user_id !== lineUserId) {
      await reply(replyToken, 'This portal is already linked to another LINE account. Please contact your consultant.')
      return
    }

    await supabase.from('students')
      .update({ line_user_id: lineUserId })
      .eq('id', match.id)

    const name = match.preferred_name || match.student_name
    await reply(replyToken,
      `Your account is now linked to ${name}'s portal.\n\n` +
      `Tap the menu buttons below to check status, view deadlines, or ask me anything in English or Thai.`
    )
    return
  }

  // ── Whitelist check ───────────────────────────────────────────────────────
  const { data: student } = await supabase
    .from('students')
    .select('id, student_name, preferred_name, parent_name, parent_phone, target_entry_year, target_year_group, stage, line_daily_count, line_daily_reset')
    .eq('line_user_id', lineUserId)
    .single()

  if (!student) {
    // Stranger — complete silence, no reply, no cost
    return
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
  const allowed = await checkAndIncrementRateLimit(student)
  if (!allowed) {
    await reply(replyToken,
      'You\'ve reached today\'s message limit. Your consultant will follow up with you directly.\n\n' +
      'The limit resets each morning (Bangkok time).'
    )
    return
  }

  // ── Build context + call Gemini ───────────────────────────────────────────
  const ctx = await buildParentContext(student.id)
  await processWithClaude(replyToken, text, ctx)
}
