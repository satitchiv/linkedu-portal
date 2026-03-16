// LinkedU Telegram consultant bot — Gemini Flash powered
// Natural language interface to student application data
// Safe scope: only touches student_schools and students tables
// Never reads/writes files, env vars, or portal code

const { GoogleGenerativeAI, FunctionCallingMode } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')
const https = require('https')
const crypto = require('crypto')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const ALLOWED_IDS = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
)

const PIPELINE = ['researching','applied','interview','offer','visit','accepted','visa','tb_test','guardianship','enrolled']
const STAGE_LABELS = {
  researching:'Researching', applied:'Applied', interview:'Interview',
  offer:'Offer', visit:'Visit', accepted:'Accepted', visa:'VISA',
  tb_test:'TB Test', guardianship:'Guardianship', enrolled:'Enrolled',
}

// ── Telegram helpers ───────────────────────────────────────────────────────────
function tgPost(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)))
    })
    req.on('error', reject)
    req.write(data); req.end()
  })
}
const send    = (chatId, text, extra = {}) => tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra })
const editMsg = (chatId, msgId, text)       => tgPost('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML' })
const answerCbq = (id, text = '')           => tgPost('answerCallbackQuery', { callback_query_id: id, text })

// ── Data helpers ───────────────────────────────────────────────────────────────
async function findStudents(name) {
  const q = name.trim()
  const [a, b] = await Promise.all([
    supabase.from('students').select('id,student_name,preferred_name,current_school,target_entry_year').ilike('student_name', `${q}%`),
    supabase.from('students').select('id,student_name,preferred_name,current_school,target_entry_year').ilike('preferred_name', `${q}%`),
  ])
  const seen = new Set()
  return [...(a.data||[]), ...(b.data||[])].filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
}

function displayName(s) { return s.preferred_name || s.student_name }

let _schoolsDb = null
function schoolsDb() {
  if (!_schoolsDb) _schoolsDb = require('../../public/data/schools.json')
  return _schoolsDb
}
function findSchoolInDb(query) {
  const q = query.toLowerCase().trim()
  const db = schoolsDb()
  return db.find(s => s.name.toLowerCase() === q)
    || db.find(s => s.name.toLowerCase().startsWith(q))
    || db.find(s => s.name.toLowerCase().includes(q))
    || null
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
}

async function buildSummary(studentId) {
  const [{ data: student }, { data: schools }, { data: docs }] = await Promise.all([
    supabase.from('students').select('student_name,preferred_name,current_school,target_entry_year').eq('id', studentId).single(),
    supabase.from('student_schools').select('school_name,application_status,latest_update,deadline').eq('student_id', studentId).neq('application_status','abandoned').order('priority'),
    supabase.from('student_documents').select('status').eq('student_id', studentId),
  ])
  if (!student) return null
  const name = displayName(student)
  let text = `<b>${name}</b>  ·  ${student.current_school || '—'}  ·  Entry ${student.target_entry_year || '—'}\n─────────────────────\n`
  if (!schools?.length) {
    text += '\nNo schools on list yet.'
  } else {
    for (const sc of schools) {
      text += `\n<b>${sc.school_name}</b>  ·  ${STAGE_LABELS[sc.application_status] || sc.application_status}\n`
      if (sc.latest_update) text += `  Update: ${sc.latest_update}\n`
      const d = daysUntil(sc.deadline)
      if (d !== null && d >= 0) text += `  Deadline: ${d}d  (${sc.deadline})\n`
    }
  }
  const doneDocs = (docs||[]).filter(d => (d.status||'').toLowerCase().includes('verif')).length
  if (docs?.length) text += `\nDocs: ${doneDocs}/${docs.length} verified`
  return text
}

// ── Core action functions (called by both Gemini tools and /commands) ──────────
async function actionSummary(chatId, studentName) {
  const students = await findStudents(studentName)
  if (!students.length) return send(chatId, `No student found matching "${studentName}".`)
  if (students.length > 1) {
    const kb = students.map(s => [{ text: `${displayName(s)}${s.current_school ? ' · ' + s.current_school : ''}`, callback_data: `sum:${s.id.slice(0,8)}` }])
    return send(chatId, 'Multiple students found — which one?', { reply_markup: { inline_keyboard: kb } })
  }
  return send(chatId, await buildSummary(students[0].id) || 'No data.')
}

async function actionAll(chatId) {
  const { data: students } = await supabase.from('students').select('id,student_name,preferred_name,current_school').neq('status','archived')
  if (!students?.length) return send(chatId, 'No students found.')
  let text = `<b>${students.length} student${students.length !== 1 ? 's' : ''}</b>\n─────────────────────\n`
  for (const s of students) {
    const { data: schools } = await supabase.from('student_schools').select('application_status,deadline').eq('student_id', s.id).neq('application_status','abandoned')
    const count = schools?.length || 0
    const highest = (schools||[]).reduce((best, sc) => PIPELINE.indexOf(sc.application_status) > PIPELINE.indexOf(best) ? sc.application_status : best, 'researching')
    const nextDl = (schools||[]).map(sc => daysUntil(sc.deadline)).filter(d => d !== null && d >= 0).sort((a,b) => a-b)[0]
    text += `\n${displayName(s)}  ·  ${count} school${count!==1?'s':''}  ·  ${STAGE_LABELS[highest] || '—'}${nextDl !== undefined ? `  ·  Next: ${nextDl}d` : ''}`
  }
  return send(chatId, text)
}

async function actionDeadlines(chatId) {
  const { data: schools } = await supabase.from('student_schools').select('school_name,deadline,student_id').not('deadline','is',null).neq('application_status','abandoned')
  if (!schools?.length) return send(chatId, 'No deadlines set.')
  const upcoming = schools.map(sc => ({ ...sc, days: daysUntil(sc.deadline) })).filter(sc => sc.days !== null && sc.days >= 0).sort((a,b) => a.days-b.days).slice(0,12)
  if (!upcoming.length) return send(chatId, 'No upcoming deadlines.')
  const ids = [...new Set(upcoming.map(sc => sc.student_id))]
  const { data: studs } = await supabase.from('students').select('id,student_name,preferred_name').in('id', ids)
  const nameMap = Object.fromEntries((studs||[]).map(s => [s.id, displayName(s).split(' ')[0].toUpperCase()]))
  let text = '<b>Upcoming deadlines</b>\n─────────────────────\n'
  for (const sc of upcoming) text += `${String(sc.days).padStart(3)}d  ${(nameMap[sc.student_id]||'?').padEnd(8)}  ${sc.school_name}  (${sc.deadline})\n`
  return send(chatId, text)
}

async function actionSetUpdate(chatId, studentName, schoolName, message) {
  const students = await findStudents(studentName)
  if (!students.length) return send(chatId, `No student found matching "${studentName}".`)
  let matches = []
  for (const s of students) {
    const { data: scs } = await supabase.from('student_schools').select('id,school_name,application_status').eq('student_id', s.id).ilike('school_name', `%${schoolName}%`)
    if (scs?.length) matches.push(...scs.map(sc => ({ student: s, school: sc })))
  }
  if (!matches.length) return send(chatId, `No school matching "${schoolName}" found for "${studentName}".`)
  const kb = [
    ...matches.map(m => [{ text: `${displayName(m.student)} · ${m.school.school_name}`, callback_data: `set:${m.student.id.slice(0,8)}:${m.school.id.slice(0,8)}:${encodeURIComponent(message).slice(0,28)}` }]),
    [{ text: 'Cancel', callback_data: 'x' }]
  ]
  const prompt = matches.length === 1
    ? `Set update for <b>${displayName(matches[0].student)}</b> at <b>${matches[0].school.school_name}</b>?\n\n"${message}"`
    : `Which school gets this update?\n\n"${message}"`
  return send(chatId, prompt, { reply_markup: { inline_keyboard: kb } })
}

async function actionAddSchool(chatId, studentName, schoolName) {
  const school = findSchoolInDb(schoolName)
  if (!school) return send(chatId, `"${schoolName}" was not found in the schools database. No changes made.`)
  const students = await findStudents(studentName)
  if (!students.length) return send(chatId, `No student found matching "${studentName}".`)
  const schoolKey = school.name.replace(/ /g,'_').slice(0,24)
  if (students.length > 1) {
    const kb = [...students.map(s => [{ text: `${displayName(s)}${s.current_school ? ' · '+s.current_school : ''}`, callback_data: `add:${s.id.slice(0,8)}:${schoolKey}` }]), [{ text: 'Cancel', callback_data: 'x' }]]
    return send(chatId, `Add <b>${school.name}</b> to which student?`, { reply_markup: { inline_keyboard: kb } })
  }
  const s = students[0]
  const feeStr = school.fee ? `  ·  £${school.fee.toLocaleString()}/yr` : ''
  const kb = [[{ text: `Yes — add to ${displayName(s)}'s list`, callback_data: `add:${s.id.slice(0,8)}:${schoolKey}` }, { text: 'Cancel', callback_data: 'x' }]]
  return send(chatId, `Add <b>${school.name}</b>${feeStr} to <b>${displayName(s)}</b>'s list as Researching?`, { reply_markup: { inline_keyboard: kb } })
}

async function actionUpdateStage(chatId, studentName, schoolName, stageKey) {
  if (!PIPELINE.includes(stageKey)) return send(chatId, `Unknown stage "${stageKey}".\n\nValid: ${PIPELINE.join(' · ')}`)
  const students = await findStudents(studentName)
  if (!students.length) return send(chatId, `No student found matching "${studentName}".`)
  let matches = []
  for (const s of students) {
    const { data: scs } = await supabase.from('student_schools').select('id,school_name,application_status').eq('student_id', s.id).ilike('school_name', `%${schoolName}%`)
    if (scs?.length) matches.push(...scs.map(sc => ({ student: s, school: sc })))
  }
  if (!matches.length) return send(chatId, `No school matching "${schoolName}" found for "${studentName}".`)
  const kb = [
    ...matches.map(m => [{ text: `${displayName(m.student)} · ${m.school.school_name}  (${STAGE_LABELS[m.school.application_status]} → ${STAGE_LABELS[stageKey]})`, callback_data: `stage:${m.student.id.slice(0,8)}:${m.school.id.slice(0,8)}:${stageKey}` }]),
    [{ text: 'Cancel', callback_data: 'x' }]
  ]
  const prompt = matches.length === 1
    ? `Update <b>${displayName(matches[0].student)}</b> / <b>${matches[0].school.school_name}</b> → <b>${STAGE_LABELS[stageKey]}</b>?`
    : `Which record should move to <b>${STAGE_LABELS[stageKey]}</b>?`
  return send(chatId, prompt, { reply_markup: { inline_keyboard: kb } })
}

// ── Gemini tool definitions ────────────────────────────────────────────────────
const TOOL_DEFS = [
  {
    name: 'get_student_summary',
    description: 'Get full summary for a student: all schools, current stages, latest updates, and upcoming deadlines',
    parameters: { type: 'OBJECT', properties: { student_name: { type: 'STRING', description: 'First name or partial name' } }, required: ['student_name'] }
  },
  {
    name: 'get_all_students',
    description: 'Get an overview of all active students with school counts, highest stage, and next deadline',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'get_deadlines',
    description: 'Get all upcoming application deadlines sorted by date across all students',
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'set_latest_update',
    description: 'Post a latest update note to a school in a student\'s list. Use when consultant reports news: interview confirmed, docs received, offer letter arrived, etc.',
    parameters: {
      type: 'OBJECT',
      properties: {
        student_name: { type: 'STRING', description: 'Student first name' },
        school_name:  { type: 'STRING', description: 'School name or partial name' },
        message:      { type: 'STRING', description: 'The update to record, written concisely' }
      },
      required: ['student_name', 'school_name', 'message']
    }
  },
  {
    name: 'add_school',
    description: 'Add a new school to a student\'s list with status Researching. Only works if school exists in the database.',
    parameters: {
      type: 'OBJECT',
      properties: {
        student_name: { type: 'STRING' },
        school_name:  { type: 'STRING', description: 'School name to find in the database' }
      },
      required: ['student_name', 'school_name']
    }
  },
  {
    name: 'update_stage',
    description: 'Update the application stage for a student at a school. Use when a stage is completed or advanced.',
    parameters: {
      type: 'OBJECT',
      properties: {
        student_name: { type: 'STRING' },
        school_name:  { type: 'STRING' },
        stage:        { type: 'STRING', description: 'One of: researching, applied, interview, offer, visit, accepted, visa, tb_test, guardianship, enrolled' }
      },
      required: ['student_name', 'school_name', 'stage']
    }
  }
]

function systemPrompt() {
  const today = new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  return `You are a smart assistant for LinkedU, a school placement consultancy helping Thai families apply to UK boarding schools. You help the consultant manage student applications via Telegram.

Today is ${today}.

Use the provided tools to answer questions and make updates. Be concise — this is a messaging interface.

Rules:
- Only use the provided tools. You cannot modify code, files, or access other systems.
- For write operations the system will show a confirmation button before any change is made.
- If a name could match multiple students or schools, use a read tool first to check.
- Write update messages in plain English, concise (under 100 characters).
- If the request is unclear, ask one short clarifying question.`
}

// ── Process message through Gemini ────────────────────────────────────────────
async function processWithGemini(chatId, userMessage) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const result = await model.generateContent({
    systemInstruction: systemPrompt(),
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    tools: [{ functionDeclarations: TOOL_DEFS }],
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  })

  const response = result.response
  const fcs = response.functionCalls()

  if (fcs?.length) {
    const { name, args } = fcs[0]
    switch (name) {
      case 'get_student_summary': return actionSummary(chatId, args.student_name)
      case 'get_all_students':    return actionAll(chatId)
      case 'get_deadlines':       return actionDeadlines(chatId)
      case 'set_latest_update':   return actionSetUpdate(chatId, args.student_name, args.school_name, args.message)
      case 'add_school':          return actionAddSchool(chatId, args.student_name, args.school_name)
      case 'update_stage':        return actionUpdateStage(chatId, args.student_name, args.school_name, args.stage)
      default: return send(chatId, `Unknown tool: ${name}`)
    }
  }

  // Gemini replied with plain text (clarifying question, etc.)
  const text = response.text()
  if (text) return send(chatId, text)
  return send(chatId, "I didn't catch that. Try asking about a student, or type /help.")
}

// ── Callback query handler (inline button confirmations) ──────────────────────
async function handleCallback(cbq) {
  const chatId = cbq.message.chat.id
  const msgId  = cbq.message.message_id
  await answerCbq(cbq.id)

  if (cbq.data === 'x') return editMsg(chatId, msgId, 'Cancelled.')

  const [action, ...params] = cbq.data.split(':')

  if (action === 'sum') {
    const { data: studs } = await supabase.from('students').select('id').ilike('id', `${params[0]}%`)
    if (!studs?.length) return editMsg(chatId, msgId, 'Student not found.')
    return editMsg(chatId, msgId, await buildSummary(studs[0].id) || 'No data.')
  }

  if (action === 'set') {
    const [studentShort, schoolShort, encodedMsg] = params
    const message = decodeURIComponent(encodedMsg)
    const [{ data: studs }, { data: scs }] = await Promise.all([
      supabase.from('students').select('id,student_name,preferred_name').ilike('id', `${studentShort}%`),
      supabase.from('student_schools').select('id,school_name').ilike('id', `${schoolShort}%`),
    ])
    if (!studs?.length || !scs?.length) return editMsg(chatId, msgId, 'Record not found.')
    await supabase.from('student_schools').update({ latest_update: message, latest_update_at: new Date().toISOString() }).eq('id', scs[0].id)
    return editMsg(chatId, msgId, `Updated.\n${displayName(studs[0])} / ${scs[0].school_name}\n\n"${message}"`)
  }

  if (action === 'add') {
    const [studentShort, schoolKey] = params
    const school = findSchoolInDb(schoolKey.replace(/_/g,' '))
    if (!school) return editMsg(chatId, msgId, 'School not found in database.')
    const { data: studs } = await supabase.from('students').select('id,student_name,preferred_name').ilike('id', `${studentShort}%`)
    if (!studs?.length) return editMsg(chatId, msgId, 'Student not found.')
    const { data: existing } = await supabase.from('student_schools').select('id').eq('student_id', studs[0].id).ilike('school_name', `%${school.name}%`)
    if (existing?.length) return editMsg(chatId, msgId, `${school.name} is already on ${displayName(studs[0])}'s list.`)
    await supabase.from('student_schools').insert({ student_id: studs[0].id, school_name: school.name, country: 'UK', application_status: 'researching', priority: 'medium', annual_fee_gbp: school.fee || null, region: school.region || null, school_type: school.type || null, sports: school.sports || [] })
    return editMsg(chatId, msgId, `Added.\n${school.name} → ${displayName(studs[0])}'s list.\nStatus: Researching`)
  }

  if (action === 'stage') {
    const [studentShort, schoolShort, stageKey] = params
    const [{ data: studs }, { data: scs }] = await Promise.all([
      supabase.from('students').select('id,student_name,preferred_name').ilike('id', `${studentShort}%`),
      supabase.from('student_schools').select('id,school_name').ilike('id', `${schoolShort}%`),
    ])
    if (!studs?.length || !scs?.length) return editMsg(chatId, msgId, 'Record not found.')
    await supabase.from('student_schools').update({ application_status: stageKey }).eq('id', scs[0].id)
    return editMsg(chatId, msgId, `Stage updated.\n${displayName(studs[0])} / ${scs[0].school_name}\n→ ${STAGE_LABELS[stageKey]}`)
  }
}

// ── Dump: extract + create student from raw text ──────────────────────────────
const GEMINI_EXTRACT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

async function geminiExtract(prompt) {
  const res = await fetch(`${GEMINI_EXTRACT_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  })
  const json = await res.json()
  return (json.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

async function extractFromDump(dump) {
  const prompt = `You are extracting student profile data for a UK boarding school placement consultant in Thailand.

Extract all available information from the text below. Return ONLY a valid JSON object (no markdown, no code fences). Use null for anything not mentioned.

STRICT RULES:
1. "destination" — COUNTRIES ONLY. Valid values: "UK", "Australia", "USA", "Canada", "Switzerland", "Singapore". Map cities to countries. Default ["UK"].
2. "target_year_group" — UK year group the student will ENTER at boarding school (not current school's next year).
3. "target_entry_year" — Calendar year they plan to START boarding school e.g. "2026".
4. "sport_notes" — If ANY medical condition mentioned, start with "MEDICAL: [condition]". Then add sport details.
5. "services_interested" — ONLY: "Application Management", "School Selection", "Interview Prep", "English Tutoring", "Campus Visit", "Guardianship".
6. "courses_interested" — Academic only: "A-Levels", "IB", "IGCSE", "BTEC", "Pre-A", "Foundation".
7. "target_schools" — Only actual named schools. Do not invent names.

{
  "student_name": null, "preferred_name": null, "dob": null, "nationality": null,
  "current_school": null, "current_year_group": null, "curriculum": null, "english_level": null,
  "primary_sport": null, "goal": null, "destination": ["UK"], "budget_gbp": null,
  "target_entry_year": null, "target_year_group": null,
  "parent_name": null, "parent_email": null, "parent_phone": null,
  "heard_from": null, "referral_note": null, "sport_notes": null, "academic_notes": null,
  "school_types_interested": [], "courses_interested": [], "services_interested": [], "target_schools": []
}

Text:
---
${dump}
---`

  const raw = await geminiExtract(prompt)
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try { return JSON.parse(clean) } catch { return {} }
}

async function summarizeDump(dump) {
  const prompt = `Summarize these enquiry notes into clean bullet points a parent can read.
Write in third person ("Student is..."). No jargon. Each line starts with "- ".
Cover: background, academics, sport, goals, budget, destination, special notes.
Max 10 bullets. Factual only. No intro, no outro, no markdown fences.

Notes:
---
${dump}
---`
  return geminiExtract(prompt)
}

async function actionDump(chatId, dump) {
  if (!dump.trim()) {
    return send(chatId, 'Usage: /dump [paste notes here]\n\nExample:\n/dump Student name is Nong, Thai, Year 8...')
  }

  // Respond immediately — Telegram requires reply within 5s or it retries
  await send(chatId, 'Processing dump — this takes a few seconds...')

  try {
    // Run extraction + summary in parallel
    const [extracted, summary] = await Promise.all([
      extractFromDump(dump),
      summarizeDump(dump),
    ])

    const { target_schools, ...fields } = extracted
    const studentName = fields.student_name || 'Unknown Student'

    // Duplicate guard — check by phone number first, then by name
    if (fields.parent_phone) {
      const { data: existing } = await supabase
        .from('students')
        .select('id, student_name')
        .eq('parent_phone', fields.parent_phone)
        .limit(1)
      if (existing?.length) {
        return send(chatId, `Duplicate detected — a student with this phone number already exists.\n\n<b>${existing[0].student_name}</b>\n\nNo record created. If this is a different student, edit the phone number in the dump.`)
      }
    }

    if (!fields.services_interested?.length) {
      fields.services_interested = ['School Selection']
    }

    const access_token = crypto.randomBytes(8).toString('hex')

    const record = {
      student_name:            studentName,
      preferred_name:          fields.preferred_name        || null,
      dob:                     fields.dob                   || null,
      nationality:             fields.nationality           || null,
      current_school:          fields.current_school        || null,
      current_year_group:      fields.current_year_group    || null,
      curriculum:              fields.curriculum            || null,
      english_level:           fields.english_level         || null,
      primary_sport:           fields.primary_sport         || null,
      goal:                    fields.goal                  || null,
      destination:             fields.destination           || [],
      budget_gbp:              fields.budget_gbp            || null,
      target_entry_year:       fields.target_entry_year     || null,
      target_year_group:       fields.target_year_group     || null,
      parent_name:             fields.parent_name           || null,
      parent_email:            fields.parent_email          || null,
      parent_phone:            fields.parent_phone          || null,
      heard_from:              fields.heard_from            || null,
      referral_note:           fields.referral_note         || null,
      sport_notes:             fields.sport_notes           || null,
      academic_notes:          fields.academic_notes        || null,
      school_types_interested: fields.school_types_interested || [],
      courses_interested:      fields.courses_interested    || [],
      services_interested:     fields.services_interested,
      consultant_notes:        dump,
      consultant_message:      summary || null,
      access_token,
      status: 'active',
      stage:  'researching',
    }

    const { data: student, error } = await supabase
      .from('students').insert(record).select().single()

    if (error) throw error

    const BASE = process.env.URL || 'https://linkedu-parent-portal.netlify.app'
    const analystLink = `${BASE}?token=${access_token}`
    const parentLink  = `${BASE}?token=${access_token}&view=parent`

    const destStr   = (fields.destination || []).join(', ') || '—'
    const budgetStr = fields.budget_gbp ? `£${Number(fields.budget_gbp).toLocaleString()}/yr` : '—'
    const sportStr  = fields.primary_sport || '—'
    const entryStr  = fields.target_entry_year ? `${fields.target_year_group || ''} ${fields.target_entry_year}`.trim() : '—'

    await send(chatId,
      `Student created.\n\n` +
      `<b>${studentName}</b>${fields.preferred_name ? ' (' + fields.preferred_name + ')' : ''}\n` +
      `${fields.nationality || '—'}  ·  ${fields.current_school || '—'}  ·  ${entryStr}\n` +
      `Destination: ${destStr}  ·  Budget: ${budgetStr}  ·  Sport: ${sportStr}\n\n` +
      `Analyst: ${analystLink}\n` +
      `Parent: ${parentLink}`
    )

  } catch (err) {
    console.error('dump error:', err)
    await send(chatId, `Error creating student: ${err.message}`)
  }
}

// ── Help text ──────────────────────────────────────────────────────────────────
const HELP = `<b>LinkedU Bot — Gemini powered</b>

Just talk naturally. Examples:

"how is ping doing"
"ping completed visa at rossall"
"add millfield to ping's list"
"what deadlines are coming up"
"set an update for ping at eton — interview confirmed"

<b>Commands:</b>
/summary [name]
/all
/deadlines
/dump [paste enquiry notes]  — creates a new student record from raw text`

// ── Main handler ───────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'ok' }

  let update
  try { update = JSON.parse(event.body) } catch { return { statusCode: 200, body: 'ok' } }

  try {
    if (update.callback_query) {
      const cbq = update.callback_query
      if (!ALLOWED_IDS.has(String(cbq.from.id))) return { statusCode: 200, body: 'ok' }
      await handleCallback(cbq)
      return { statusCode: 200, body: 'ok' }
    }

    const msg = update.message
    if (!msg?.text) return { statusCode: 200, body: 'ok' }
    if (!ALLOWED_IDS.has(String(msg.from.id))) {
      console.log('Blocked unauthorized user:', msg.from.id)
      return { statusCode: 200, body: 'ok' }
    }

    const chatId = msg.chat.id
    const text   = msg.text.trim()

    // Hard commands that bypass Gemini
    if (text === '/help' || text === '/start') {
      await send(chatId, HELP)
      return { statusCode: 200, body: 'ok' }
    }

    if (text.startsWith('/dump')) {
      const dump = text.slice(5).trim()
      await actionDump(chatId, dump)
      return { statusCode: 200, body: 'ok' }
    }

    // Everything else goes through Gemini
    await processWithGemini(chatId, text)

  } catch (err) {
    console.error('telegram-bot error:', err)
  }

  return { statusCode: 200, body: 'ok' }
}
