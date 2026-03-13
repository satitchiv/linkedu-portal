// POST /api/create-student
// Creates a new student from a raw data dump — uses Gemini to extract structured fields
// Auth: X-Admin-Secret required
// Body: { dump: "raw text..." }

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

async function extractFromDump(dump) {
  const prompt = `You are extracting student profile data for a UK boarding school placement consultant in Thailand.

Extract all available information from the text below. Return ONLY a valid JSON object (no markdown). Use null for anything not mentioned.

{
  "student_name": "Full legal name",
  "preferred_name": "Nickname or first name",
  "dob": "YYYY-MM-DD or null",
  "nationality": "e.g. Thai",
  "current_school": "School name",
  "current_year_group": "e.g. Year 9",
  "curriculum": "e.g. Thai, IB, IGCSE, British",
  "english_level": "e.g. B2, Intermediate, IELTS 6.0",
  "primary_sport": "e.g. Golf",
  "goal": "What the family wants to achieve",
  "destination": ["UK"],
  "budget_gbp": 40000,
  "target_entry_year": "2026",
  "target_year_group": "Year 11",
  "parent_name": "Parent full name",
  "parent_email": "email@example.com or null",
  "parent_phone": "+66...",
  "heard_from": "How they found LinkedU",
  "referral_note": "Referrer name if any",
  "sport_notes": "Sport-related details",
  "academic_notes": "Academic notes or concerns",
  "school_types_interested": ["boarding"],
  "courses_interested": ["A-Levels"],
  "services_interested": ["Application Management"],
  "target_schools": ["School A", "School B"]
}

Text:
---
${dump}
---`

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
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

  const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { dump } = JSON.parse(event.body || '{}')
    if (!dump?.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'dump is required' }) }
    }

    // Extract structured data
    const extracted = await extractFromDump(dump)
    const { target_schools, ...fields } = extracted

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
      consultant_notes:        dump,  // raw dump preserved in full
      access_token,
      status: 'active',
      stage:  'researching',
    }

    const { data: student, error: insertErr } = await supabase
      .from('students').insert(record).select().single()

    if (insertErr) throw insertErr

    // Create student_schools rows for target schools
    if (Array.isArray(target_schools) && target_schools.length) {
      await supabase.from('student_schools').insert(
        target_schools.map((name, i) => ({
          student_id: student.id,
          school_name: name,
          application_status: 'researching',
          priority: i + 1,
        }))
      )
    }

    const BASE = process.env.URL || 'https://linkedu-parent-portal.netlify.app'
    const portalLink = `${BASE}?token=${access_token}&view=parent`

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        student: { id: student.id, studentName: student.student_name, parentEmail: student.parent_email },
        extracted,
        portalLink,
        schoolsCreated: Array.isArray(target_schools) ? target_schools.length : 0,
      })
    }

  } catch (err) {
    console.error('create-student error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
