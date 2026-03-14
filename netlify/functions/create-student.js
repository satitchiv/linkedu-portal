// POST /api/create-student
// Creates a new student from a raw data dump — uses Gemini to extract structured fields
// Auth: X-Admin-Secret required
// Body: { dump: "raw text..." }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
const crypto = require('crypto')
const fs   = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

function getGeminiKey() {
  const envKey = process.env.GEMINI_API_KEY
  if (envKey && envKey.startsWith('AIza')) return envKey
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const match = envFile.match(/^GEMINI_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch (e) {}
  return envKey
}

async function summarizeDump(dump) {
  const prompt = `You are a UK boarding school placement consultant's assistant.

Summarize the following enquiry notes into clean, concise bullet points that a parent can read and understand.
Write in third person (e.g. "Student is..."). No jargon. No markdown headers. Each line starts with a dash and a space (- ).
Cover: student background, academic situation, sports/interests, goals, budget, preferred destination, any special needs or notes.
Maximum 10 bullet points. Be factual — only include what is mentioned.

Return ONLY the bullet points. No intro, no outro, no markdown fences.

Notes:
---
${dump}
---`

  const res = await fetch(`${GEMINI_URL}?key=${getGeminiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  })
  const json = await res.json()
  return (json.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
}

async function extractFromDump(dump) {
  const prompt = `You are extracting student profile data for a UK boarding school placement consultant in Thailand.

Extract all available information from the text below. Return ONLY a valid JSON object (no markdown, no code fences). Use null for anything not mentioned.

STRICT RULES — read carefully before extracting:

1. "destination" — COUNTRIES ONLY. Never include cities (Melbourne, London, etc.) or states. Valid values: "UK", "Australia", "USA", "Canada", "Switzerland", "Singapore". If a city is mentioned (e.g. Melbourne), map it to the country (Australia). Default to ["UK"] if unclear.

2. "target_year_group" — The UK year group the student will ENTER at boarding school, NOT their next year group at current school. If a student is in Year 7 now and wants to board from Year 9, target_year_group = "Year 9". If the text says "wants to go next year" and they are Year 7 now, that still needs analysis — what boarding year makes sense for their age and goal? Do NOT just add 1 to current year.

3. "target_entry_year" — The calendar year they plan to START boarding school (e.g. "2026", "2027").

4. "sport_notes" — If ANY medical condition is mentioned (heart condition, asthma, allergy, surgery, etc.), start with "MEDICAL: [condition]" in all caps. Then add sport/activity details. If no sport interest, still capture the medical note.

5. "services_interested" — ONLY include formal LinkedU services. Valid values: "Application Management", "School Selection", "Interview Prep", "English Tutoring", "Campus Visit", "Guardianship". Do NOT include activity types like "Excursions", "Summer Camp", "Fun Activities", "Boarding".

6. "courses_interested" — Academic programmes only: "A-Levels", "IB", "IGCSE", "BTEC", "Pre-A", "Foundation". Not hobbies or extracurriculars.

7. "academic_notes" — Include any academic concerns, learning difficulties, tutor needs, exam history, or subject strengths/weaknesses.

8. "goal" — What the family ultimately wants to achieve (independence, top university, specific career, safe environment, etc.).

9. "target_schools" — Only actual named schools. Do not guess or invent school names.

{
  "student_name": "Full legal name",
  "preferred_name": "Nickname or first name used daily",
  "dob": "YYYY-MM-DD or null",
  "nationality": "e.g. Thai",
  "current_school": "School name",
  "current_year_group": "e.g. Year 7",
  "curriculum": "e.g. Thai, IB, IGCSE, British",
  "english_level": "e.g. B2, Intermediate, IELTS 6.0",
  "primary_sport": "Main sport or null if none",
  "goal": "What the family wants to achieve",
  "destination": ["UK"],
  "budget_gbp": 40000,
  "target_entry_year": "2026",
  "target_year_group": "Year 9",
  "parent_name": "Parent full name",
  "parent_email": "email@example.com or null",
  "parent_phone": "+66...",
  "heard_from": "How they found LinkedU",
  "referral_note": "Referrer name if any",
  "sport_notes": "MEDICAL: [condition] if any. Then sport details.",
  "academic_notes": "Academic notes, concerns, subjects, tutoring needs",
  "school_types_interested": ["boarding"],
  "courses_interested": ["A-Levels"],
  "services_interested": ["Application Management"],
  "target_schools": ["School A", "School B"]
}

Text:
---
${dump}
---`

  const res = await fetch(`${GEMINI_URL}?key=${getGeminiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  })

  const json = await res.json()
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(clean)
  } catch (e) {
    console.error('Gemini parse error. Raw:', raw)
    return {}
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { dump } = JSON.parse(event.body || '{}')
    if (!dump?.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'dump is required' }) }
    }

    // Extract structured data + generate summary in parallel
    const [extracted, summary] = await Promise.all([
      extractFromDump(dump),
      summarizeDump(dump),
    ])
    const { target_schools, ...fields } = extracted

    // Default services if Gemini left it empty
    if (!fields.services_interested || fields.services_interested.length === 0) {
      fields.services_interested = ['School Selection']
    }

    // Generate access token
    const access_token = crypto.randomBytes(8).toString('hex')

    // Build student record
    const record = {
      student_name:            fields.student_name          || 'New Student',
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
      services_interested:     fields.services_interested   || [],
      consultant_notes:        dump,              // raw dump preserved for analyst
      consultant_message:      summary || null,   // AI bullet summary visible to parents
      access_token,
      status: 'active',
      stage:  'researching',
    }

    const { data: student, error: insertErr } = await supabase
      .from('students').insert(record).select().single()

    if (insertErr) throw insertErr

    const BASE = process.env.URL || 'https://linkedu-parent-portal.netlify.app'
    const analystLink = `${BASE}?token=${access_token}`
    const parentLink  = `${BASE}?token=${access_token}&view=parent`

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        student: { id: student.id, studentName: student.student_name, parentEmail: student.parent_email },
        extracted,
        analystLink,
        parentLink,
      })
    }

  } catch (err) {
    console.error('create-student error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
