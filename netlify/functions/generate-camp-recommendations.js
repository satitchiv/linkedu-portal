// POST /api/generate-camp-recommendations
// Scores all Notion summer camps against a student profile, saves top 10, sends Telegram notification
// Requires: X-Admin-Secret header or Supabase JWT (analyst role)
//
// Scoring (110 pts max, capped at 100):
//   1. Age match       40pts  (hard exclude if student age not in eligible range)
//   2. Subject/goal    30pts  (courses_interested + goal vs Programme Subjects + Type of Programme)
//   3. Budget fit      20pts  (summer_camp_budget_gbp or budget_gbp vs Residential GBP)
//   4. Sport match     20pts  (primary_sport vs football/multi-sports programme type — direct: 20, multi: 10)

const { createClient } = require('@supabase/supabase-js')
const { Client } = require('@notionhq/client')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const notion = new Client({ auth: process.env.NOTION_KEY })

const NOTION_DB_ID = '3199d89c-abdc-81cd-96e9-eace5ee01834'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse eligible ages from text like "13,14,15,16" or "13-17" or "13 to 17"
function parseEligibleAges(text) {
  if (!text) return []
  // Range format: "13-17" or "13 to 17"
  const rangeMatch = text.match(/(\d+)\s*(?:-|to)\s*(\d+)/)
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1])
    const max = parseInt(rangeMatch[2])
    const ages = []
    for (let i = min; i <= max; i++) ages.push(i)
    return ages
  }
  // Comma-separated: "13,14,15"
  return text.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n))
}

// Calculate student age from dob string
function calcAge(dob) {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Parse a GBP amount from a text string like "£2,500" or "2500" or "2,500 GBP"
// Prefers numbers after £ symbol; falls back to first 3+ digit number (to skip things like "2 weeks")
function parseGBP(text) {
  if (!text) return null
  // First preference: number immediately after £
  const gbpMatch = text.match(/£([\d,]+)/)
  if (gbpMatch) return parseInt(gbpMatch[1].replace(/,/g, ''))
  // Fallback: first number with 3+ digits (skips "2 weeks", "10%" etc.)
  const numMatch = text.match(/\b(\d[\d,]{2,})\b/)
  if (!numMatch) return null
  const num = parseInt(numMatch[1].replace(/,/g, ''))
  return isNaN(num) ? null : num
}

// Fetch all pages from Notion database (handles pagination)
async function fetchAllCamps() {
  const camps = []
  let cursor = undefined
  do {
    const response = await notion.databases.query({
      database_id: NOTION_DB_ID,
      start_cursor: cursor,
      page_size: 100,
    })
    for (const page of response.results) {
      const p = page.properties
      const get = (key, type) => {
        const prop = p[key]
        if (!prop) return null
        if (type === 'title') return prop.title?.map(t => t.plain_text).join('') || null
        if (type === 'text') return prop.rich_text?.map(t => t.plain_text).join('') || null
        if (type === 'select') return prop.select?.name || null
        if (type === 'url') return prop.url || null
        return null
      }
      camps.push({
        pageUrl: page.url,
        name:               get('Title', 'title'),
        eligibleAges:       get('Eligible Ages', 'text'),
        ageOfParticipants:  get('Age of Participants', 'text'),
        programmeSubjects:  get('Programme Subjects', 'text'),
        programmeType:      get('Type of Programme', 'select'),
        priceFee:           get('Price Fee', 'text'),
        residentialGBP:     get('Residential (GBP)', 'text'),
        nonResidentialGBP:  get('Non Residential (GBP)', 'text'),
        cityLocation:       get('City Location', 'text'),
        boardingLocation:   get('Boarding Location', 'text'),
        period:             get('Period', 'text'),
        brochure:           get('Brochure', 'url'),
        website:            get('Website', 'url'),
        summerCampLink:     get('Summer Camp Link', 'url'),
        courses:            get('Courses', 'text'),
        syllabus:           get('Syllabus', 'text'),
      })
    }
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)
  return camps
}

// ── Scoring algorithm ─────────────────────────────────────────────────────────
function scoreCamp(camp, student) {
  let score = 0
  const reasons = []

  // ── 1. Age match (40pts) — HARD EXCLUDE if no match ──────────────────────
  const studentAge = student.age
  if (studentAge !== null) {
    const ageText = camp.eligibleAges || camp.ageOfParticipants
    const eligibleAges = parseEligibleAges(ageText)
    if (eligibleAges.length > 0) {
      if (eligibleAges.includes(studentAge)) {
        score += 40
        reasons.push(`Age ${studentAge} is within the eligible age range (${ageText})`)
      } else {
        // Check ±1 year leniency
        if (eligibleAges.includes(studentAge + 1) || eligibleAges.includes(studentAge - 1)) {
          score += 20
          reasons.push(`Age ${studentAge} is just outside the eligible range (${ageText}) — worth discussing with the programme`)
        } else {
          return null // hard exclude
        }
      }
    } else {
      // No age data — don't exclude, give partial points
      score += 20
      reasons.push('Age eligibility not specified — confirm with programme directly')
    }
  } else {
    score += 20
    reasons.push('Student date of birth not set — confirm age eligibility before applying')
  }

  // ── 2. Subject / goal match (30pts) ──────────────────────────────────────
  const studentText = [
    student.goal || '',
    (student.coursesInterested || []).join(' '),
    student.academicNotes || '',
  ].join(' ').toLowerCase()

  const campText = [
    camp.programmeSubjects || '',
    camp.programmeType || '',
    camp.courses || '',
    camp.syllabus || '',
    camp.name || '',
  ].join(' ').toLowerCase()

  const subjectKeywords = [
    ['medicine', 'medical', 'doctor', 'dentist', 'pre-med'],
    ['computer science', 'coding', 'programming', 'stem', 'technology'],
    ['english', 'language', 'efl'],
    ['football', 'soccer'],
    ['tennis'],
    ['golf'],
    ['swimming', 'swim'],
    ['leadership', 'lira', 'international relations'],
    ['science', 'biology', 'chemistry', 'physics'],
    ['university', 'oxbridge', 'cambridge', 'oxford', 'university preparation'],
    ['business', 'economics'],
    ['art', 'design', 'creative'],
    ['academic', 'gcse', 'a-level', 'ib', 'study skills', 'tutoring'],
    ['sports', 'sport', 'multi-sport', 'outdoor', 'adventure', 'multi-activity'],
  ]

  let subjectMatches = 0
  const matchedSubjects = []
  for (const group of subjectKeywords) {
    const studentHas = group.some(k => studentText.includes(k))
    const campHas = group.some(k => campText.includes(k))
    if (studentHas && campHas) {
      subjectMatches++
      matchedSubjects.push(group[0])
    }
  }

  if (subjectMatches >= 2) {
    score += 30
    reasons.push(`Strong subject match — ${matchedSubjects.join(', ')} aligns with student interests`)
  } else if (subjectMatches === 1) {
    score += 15
    reasons.push(`Partial subject match — ${matchedSubjects.join(', ')} aligns with student interests`)
  } else {
    reasons.push('Programme subjects do not closely match student interests')
  }

  // ── 3. Budget fit (20pts) ─────────────────────────────────────────────────
  const budget = student.summerCampBudget || student.budgetGBP
  const campFee = parseGBP(camp.residentialGBP) || parseGBP(camp.priceFee)

  if (budget && campFee) {
    if (campFee <= budget) {
      score += 20
      reasons.push(`Fee £${campFee.toLocaleString()} fits within summer camp budget of £${budget.toLocaleString()}`)
    } else if (campFee <= budget * 1.20) {
      score += 10
      reasons.push(`Fee £${campFee.toLocaleString()} is slightly over budget (within 20%) — worth considering`)
    } else {
      reasons.push(`Fee £${campFee.toLocaleString()} exceeds budget of £${budget.toLocaleString()}`)
    }
  } else if (!budget) {
    score += 10
    reasons.push('No summer camp budget set — fee assessment skipped')
  } else {
    score += 10
    reasons.push('Fee information not available — confirm pricing directly with programme')
  }

  // ── 4. Sport match (20pts) ────────────────────────────────────────────────
  const sport = (student.primarySport || '').toLowerCase()
  const campAllText = [
    camp.programmeType || '',
    camp.programmeSubjects || '',
    camp.courses || '',
    camp.name || '',
  ].join(' ').toLowerCase()

  if (sport) {
    if (campAllText.includes(sport)) {
      score += 20
      reasons.push(`${student.primarySport} programme available — direct sport match`)
    } else if (campAllText.includes('multi-sport') || campAllText.includes('multi-activity')) {
      score += 10
      reasons.push(`Multi-sports programme — ${student.primarySport} may be available`)
    }
  }

  score = Math.min(score, 100)
  const tier = score >= 75 ? 'strong_match' : score >= 55 ? 'good_match' : 'consider'

  return {
    notion_page_url:   camp.pageUrl,
    camp_name:         camp.name || 'Unnamed Programme',
    programme_type:    camp.programmeType,
    city_location:     camp.cityLocation,
    boarding_location: camp.boardingLocation,
    programme_subjects: camp.programmeSubjects,
    eligible_ages:     camp.eligibleAges || camp.ageOfParticipants,
    price_text:        camp.priceFee,
    residential_gbp:   parseGBP(camp.residentialGBP),
    non_residential_gbp: parseGBP(camp.nonResidentialGBP),
    period:            camp.period,
    brochure_url:      camp.brochure || camp.summerCampLink || camp.website,
    website_url:       camp.website || camp.summerCampLink,
    score,
    tier,
    match_reasons: reasons,
  }
}

// ── Telegram notification ─────────────────────────────────────────────────────
async function sendTelegram(studentName, topCamps) {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return

  const tierLabel = { strong_match: 'Strong', good_match: 'Good', consider: 'Consider' }

  const lines = [
    `Summer Camp Recommendations — ${studentName}`,
    ``,
    `Top ${Math.min(topCamps.length, 10)} matches:`,
    ...topCamps.slice(0, 10).map((c, i) =>
      `${i + 1}. ${tierLabel[c.tier] || 'Consider'} — ${c.camp_name} (${c.score}pts, ${c.city_location || 'UK'})`
    ),
    ``,
    `Review and approve in the consultant dashboard`,
  ]

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text: lines.join('\n') })
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { student_id } = JSON.parse(event.body || '{}')
    if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Fetch student
    const { data: student, error: studentErr } = await supabase
      .from('students').select('*').eq('id', student_id).single()
    if (studentErr || !student) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }

    const studentProfile = {
      studentName:       student.student_name,
      age:               calcAge(student.dob),
      goal:              student.goal || '',
      coursesInterested: student.courses_interested || [],
      academicNotes:     student.academic_notes || '',
      primarySport:      student.primary_sport || '',
      summerCampBudget:  student.summer_camp_budget_gbp || null,
      budgetGBP:         student.budget_gbp || null,
    }

    // Fetch all camps from Notion
    const camps = await fetchAllCamps()

    // Score all camps
    const scored = camps
      .map(camp => scoreCamp(camp, studentProfile))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    if (!scored.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: 0, message: 'No matching camps found' }) }
    }

    // Clear old pending camp recommendations (keep approved ones)
    await supabase.from('student_camp_recommendations')
      .delete()
      .eq('student_id', student_id)
      .eq('approved', false)

    // Insert new recommendations
    const rows = scored.map(s => ({ ...s, student_id, approved: false, consultant_note: null }))
    const { data: insertedRows, error: insertErr } = await supabase
      .from('student_camp_recommendations').insert(rows).select()
    if (insertErr) throw insertErr

    sendTelegram(studentProfile.studentName, scored).catch(e => console.error('Telegram notify failed:', e))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: scored.length, topScore: scored[0]?.score, student_id }),
    }

  } catch (err) {
    console.error('generate-camp-recommendations error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
