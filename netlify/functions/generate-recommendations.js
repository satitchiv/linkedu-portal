// POST /api/generate-recommendations
// Scores all 114 schools against a student profile, saves top 20, sends Telegram notification
// Requires: Supabase JWT or X-Admin-Secret header
//
// Scoring (100 pts total):
//   1. Budget fit      30pts
//   2. Sport match     25pts  (coreSport+15teams=25, coreSport=15, general=5, none=0)
//   3. Scholarship     10pts  (when fee >85% of budget)
//   4. Academic match  20pts  (student avg vs school A-level %; academic style modifier)
//   5. Boarding ratio  15pts  (80%+=15, 60-79%=12, 40-59%=8, <40%=3)

const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SCHOOLS = require(path.join(__dirname, '../../data/schools.json'))

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSport(s) {
  return s.toLowerCase().replace(/[^a-z]/g, ' ').trim()
}

function sportMatches(studentSport, schoolSports) {
  const ss = normalizeSport(studentSport)
  return schoolSports.some(s => {
    const sn = normalizeSport(s)
    return sn.includes(ss) || ss.includes(sn.split(' ')[0])
  })
}

// Classify scholarship remission type
// Returns: 'monetary' | 'honorary' | 'none'
function getScholarshipTier(schol) {
  if (!schol || schol.length < 5) return 'none'
  const s = schol.toLowerCase()
  // Explicitly no scholarship
  if (s.startsWith('remission: n/a') || s.includes('no merit scholarship') || s.includes('withdrawn')) return 'none'
  // Purely honorary — no real money
  if (/honorary only/.test(s) && !/honorary only.*\d+%/.test(s)) return 'honorary'
  if (/honorary \(£60/.test(s) || /honorary \(headmaster/.test(s)) return 'honorary'
  // Has actual monetary value: % or £ amount present
  if (/\d+%/.test(schol) || /£[\d,]+/.test(schol)) return 'monetary'
  // Not publicly disclosed but remission exists — benefit of the doubt
  if (s.includes('not publicly') || s.includes('undisclosed') || s.includes('not specified') ||
      s.includes('fraction') || s.includes('case-by-case') || s.includes('partial')) return 'monetary'
  return 'honorary' // default conservative
}

// Detect if parent/student explicitly says they don't care about boarding ratio
function boardingRatioDontCare(student) {
  const text = [student.goal || '', student.academicNotes || '', student.sportNotes || ''].join(' ').toLowerCase()
  return /don.t care|doesn.t matter|not (important|fussed|bothered)|either way|flexible|any (boarding|school type)|no preference.*boarding|boarding.*no preference/i.test(text)
}

// Detect if student/parent wants a more academic-focused or balanced experience
// Returns: 'academic' | 'balanced' | 'unknown'
function detectAcademicStyle(student) {
  const text = [
    student.goal || '',
    student.academicNotes || '',
    (student.coursesInterested || []).join(' '),
  ].join(' ').toLowerCase()

  const academicKeywords = ['university', 'oxbridge', 'russell group', 'academic', 'top ranked', 'ucl', 'imperial', 'cambridge', 'oxford', 'stem']
  const balancedKeywords = ['balanced', 'enjoyable', 'sport', 'wellbeing', 'pastoral', 'happy', 'fun', 'social', 'activities', 'holistic']

  const academicScore = academicKeywords.filter(k => text.includes(k)).length
  const balancedScore = balancedKeywords.filter(k => text.includes(k)).length

  if (academicScore > balancedScore) return 'academic'
  if (balancedScore > academicScore) return 'balanced'
  return 'unknown'
}

// ── Scoring algorithm ─────────────────────────────────────────────────────────
function scoreSchool(school, student) {
  let score = 0
  const reasons = []

  // ── 1. Budget fit (30pts) ─────────────────────────────────────────────────
  const budget = student.budgetGBP
  const fee = school.fee
  if (budget && fee) {
    if (fee <= budget) {
      score += 30
      reasons.push(`Fee £${fee.toLocaleString()}/yr fits within budget of £${budget.toLocaleString()}`)
    } else if (fee <= budget * 1.20) {
      score += 15
      reasons.push(`Fee £${fee.toLocaleString()}/yr is slightly over budget (within 20%) — scholarship may help`)
    } else {
      return null // hard exclude — too expensive
    }
  }

  // ── Academic floor: exclude weak schools for university-focused students ──
  const academicStyleEarly = student.academicStyle || 'unknown'
  if (academicStyleEarly === 'academic' && school.alevel !== null && school.alevel < 30) {
    return null // hard exclude — A*-A rate too low for university-focused student
  }

  // ── 2. Sport match (25pts) ────────────────────────────────────────────────
  const hasMedical = /^MEDICAL:/i.test(student.sportNotes || '')
  const coreSportCount = (school.coreSports || []).length

  if (student.primarySport) {
    const sport = student.primarySport
    const coreSports = school.coreSports || []
    const allSports = school.sports || []

    const isCore = coreSports.length && sportMatches(sport, coreSports)
    const isGeneral = allSports.length && sportMatches(sport, allSports)
    const totalSportCount = allSports.length

    if (isCore && totalSportCount >= 15) {
      score += 25
      reasons.push(`${sport} is a core sport and the school runs ${totalSportCount}+ sport programmes — excellent pathway`)
    } else if (isCore) {
      score += 15
      reasons.push(`${sport} is a core sport at this school — structured programme available`)
    } else if (isGeneral) {
      score += 5
      reasons.push(`${sport} is available as a general sport — less structured than a core programme`)
    } else {
      reasons.push(`${sport} not listed in this school's sports programme`)
    }

    // Medical flag — warn even if sport matches
    if (hasMedical && coreSportCount >= 4) {
      const medicalDetail = (student.sportNotes || '').split('.')[0]
      reasons.push(`MEDICAL FLAG: ${medicalDetail} — confirm physical demands of sport programme with family before applying`)
    }
  } else {
    // No primary sport — penalise sport-identity schools
    if (coreSportCount >= 4) {
      if (hasMedical) {
        score -= 20
        const medicalDetail = (student.sportNotes || '').split('.')[0]
        reasons.push(`MEDICAL FLAG: ${medicalDetail} — this school has a strong sport identity (${coreSportCount} core sports). Not recommended without medical clearance.`)
      } else {
        score -= 10
        reasons.push(`Student has no sport interest — school has a strong sport identity (${coreSportCount} core sports). Culture fit risk.`)
      }
    }
  }

  // ── 3. Scholarship (10pts monetary / 5pts honorary / 0pts none) ──────────
  const scholTier = getScholarshipTier(school.schol)
  if (scholTier === 'monetary') {
    score += 10
    reasons.push(`Scholarship with fee remission available — real cost reduction possible`)
  } else if (scholTier === 'honorary') {
    score += 5
    reasons.push(`Honorary scholarship available — recognition award, no fee reduction`)
  } else {
    reasons.push(`No scholarship programme at this school`)
  }

  // ── 4. Academic match (20pts) ─────────────────────────────────────────────
  const academics = student.academics || []
  const schoolALevel = school.alevel // % of students getting A*-A at A-level
  const schoolGCSE = school.gcse    // % of students getting A*-A at GCSE

  // Use A-level % as primary benchmark; fall back to GCSE
  const schoolBenchmark = schoolALevel || schoolGCSE
  const academicStyle = student.academicStyle || 'unknown'

  if (academics.length > 0 && schoolBenchmark) {
    const scores = academics
      .filter(a => a.score !== null && (a.maxScore || a.max_score))
      .map(a => (a.score / (a.maxScore || a.max_score)) * 100)
    const avgPct = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

    if (avgPct !== null) {
      const diff = avgPct - schoolBenchmark  // positive = student above benchmark

      // Apply academic style modifier
      let styleNote = ''
      if (academicStyle === 'academic' && schoolBenchmark >= 65) {
        // Bonus: student wants competitive academics, school matches
        styleNote = ' and aligns with your academic ambitions'
      } else if (academicStyle === 'balanced' && schoolBenchmark >= 40 && schoolBenchmark <= 70) {
        styleNote = ' and offers a well-rounded academic environment'
      }

      if (diff >= 15) {
        score += 15
        reasons.push(`Student's average (~${Math.round(avgPct)}%) exceeds this school's benchmark (${schoolBenchmark}%)${styleNote} — very comfortable fit`)
      } else if (diff >= 0) {
        score += 20
        reasons.push(`Student's academic level (~${Math.round(avgPct)}%) matches this school's benchmark (${schoolBenchmark}%)${styleNote}`)
      } else if (diff >= -15) {
        score += 10
        reasons.push(`School's benchmark (${schoolBenchmark}%) is slightly above student's average (~${Math.round(avgPct)}%) — achievable stretch${styleNote}`)
      } else {
        score += 5
        reasons.push(`School's benchmark (${schoolBenchmark}%) is significantly above student's current average (~${Math.round(avgPct)}%) — ambitious target`)
      }
    } else {
      // No score/maxScore data
      score += 12
      if (schoolBenchmark) reasons.push(`School's A*-A rate is ${schoolBenchmark}% — academic profile pending`)
    }
  } else if (schoolBenchmark) {
    score += 12
    reasons.push(`School's A*-A rate is ${schoolBenchmark}% — academic profile pending`)
  } else {
    score += 10
    reasons.push('Academic benchmarks not available for this school')
  }

  // Academic style preference note (standalone, when no grades to compare)
  if (academics.length === 0 && schoolBenchmark) {
    if (academicStyle === 'academic' && schoolBenchmark >= 65) {
      reasons.push('Strong academic results at this school suit your university ambitions')
    } else if (academicStyle === 'balanced' && schoolBenchmark >= 40 && schoolBenchmark <= 70) {
      reasons.push('Balanced academic environment — good fit for an enjoyable school experience')
    }
  }

  // ── 5. Boarding ratio (15pts) ─────────────────────────────────────────────
  const ratio = school.boardRatio
  if (boardingRatioDontCare(student)) {
    // Parent explicitly doesn't care about boarding ratio — full points
    score += 15
    if (ratio != null) reasons.push(`${Math.round(ratio)}% boarding ratio — boarding mix not a priority for this family`)
    else reasons.push(`Boarding ratio not a priority for this family`)
  } else if (ratio != null) {
    if (ratio >= 80) {
      score += 15
      reasons.push(`${Math.round(ratio)}% boarding ratio — predominantly boarding community`)
    } else if (ratio >= 60) {
      score += 12
      reasons.push(`${Math.round(ratio)}% boarding ratio — strong boarding culture`)
    } else if (ratio >= 40) {
      score += 8
      reasons.push(`${Math.round(ratio)}% boarding ratio — mixed boarding and day`)
    } else {
      score += 3
      reasons.push(`${Math.round(ratio)}% boarding ratio — mostly day school with boarding available`)
    }
  }

  // Cap at 100
  score = Math.min(score, 100)

  const tier = score >= 85 ? 'strong_match' : score >= 70 ? 'good_match' : 'consider'

  return {
    school_id:       school.id,
    school_name:     school.name,
    school_slug:     school.slug,
    score,
    tier,
    fee:             school.fee || null,
    region:          school.region || null,
    school_type:     school.type || null,
    sports:          school.sports || [],
    core_sports:     school.coreSports || [],
    has_scholarship: !!(school.schol && school.schol.length > 5),
    match_reasons:   reasons.length ? reasons : ['General match based on profile'],
  }
}

// ── Telegram notification ─────────────────────────────────────────────────────
async function sendTelegram(student, topSchools) {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return

  const tierLabel = { strong_match: '🟢 Strong', good_match: '🟡 Good', consider: '⚪️ Consider' }

  const profileLines = []
  if (student.budgetGBP)          profileLines.push(`💰 Budget: £${student.budgetGBP.toLocaleString()}/yr`)
  if (student.primarySport)       profileLines.push(`⚽ Sport: ${student.primarySport}`)
  if (student.destination?.length) profileLines.push(`🌍 Destination: ${student.destination.join(', ')}`)
  if (student.schoolTypesInterested?.length) profileLines.push(`🏫 School type: ${student.schoolTypesInterested.join(', ')}`)
  if (student.coursesInterested?.length)     profileLines.push(`📚 Courses: ${student.coursesInterested.join(', ')}`)
  if (student.academicStyle && student.academicStyle !== 'unknown') profileLines.push(`🎯 Style: ${student.academicStyle === 'academic' ? 'Academic / University-focused' : 'Balanced / Sport-focused'}`)
  if (student.sportNotes)         profileLines.push(`🏅 Sport notes: ${student.sportNotes}`)
  if (student.academicNotes)      profileLines.push(`📖 Academic notes: ${student.academicNotes}`)

  const lines = [
    `🎓 *New School Recommendations — ${student.studentName || 'Student'}*`,
    ``,
    ...profileLines,
    ``,
    `*Top ${Math.min(topSchools.length, 10)} matches:*`,
    ...topSchools.slice(0, 10).map((s, i) =>
      `${i + 1}\\. ${tierLabel[s.tier] || '⚪️'} — *${s.school_name}* (${s.score}pts, £${(s.fee || 0).toLocaleString()})`
    ),
    ``,
    `_Review and approve in the consultant dashboard_`,
  ]

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text: lines.join('\n'),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
    })
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

  try {
    // Auth: Supabase JWT or admin secret
    const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    let studentId = null

    if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
      const body = JSON.parse(event.body || '{}')
      if (body.student_id) {
        studentId = body.student_id
      } else if (body.student_name) {
        const { data: found } = await supabase
          .from('students')
          .select('id')
          .ilike('student_name', `%${body.student_name}%`)
          .limit(1)
          .single()
        if (!found) return { statusCode: 404, headers, body: JSON.stringify({ error: `Student "${body.student_name}" not found` }) }
        studentId = found.id
      }
    } else {
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      const { data: profile } = await supabase.from('user_profiles').select('student_id, role').eq('id', user.id).single()
      if (!profile || !profile.student_id) return { statusCode: 404, headers, body: JSON.stringify({ error: 'No student linked' }) }
      studentId = profile.student_id
    }

    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Fetch student + academics in parallel (service role key bypasses RLS)
    const [{ data: student }, { data: academics }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('student_academics').select('*').eq('student_id', studentId),
    ])

    if (!student) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }

    const academicStyle = detectAcademicStyle({
      goal: student.goal,
      academicNotes: student.academic_notes,
      coursesInterested: student.courses_interested,
    })

    const studentProfile = {
      studentName:           student.student_name,
      budgetGBP:             student.budget_gbp,
      primarySport:          student.primary_sport,
      destination:           student.destination || [],
      schoolTypesInterested: student.school_types_interested || [],
      coursesInterested:     student.courses_interested || [],
      goal:                  student.goal || '',
      academicNotes:         student.academic_notes || '',
      sportNotes:            student.sport_notes || '',
      academicStyle,
      academics:             academics || [],
    }

    // Filter schools: only include UK schools if student destination includes UK (or is empty)
    const wantsUK = !studentProfile.destination.length ||
      studentProfile.destination.some(d => d.toLowerCase().includes('uk') || d.toLowerCase().includes('united kingdom') || d.toLowerCase().includes('england'))

    const eligibleSchools = wantsUK ? SCHOOLS : []

    // Score all eligible schools
    const scored = eligibleSchools
      .map(school => scoreSchool(school, studentProfile))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)

    if (!scored.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: 0, message: 'No matches found within budget' }) }
    }

    // Clear old pending recommendations (keep approved ones)
    await supabase.from('student_recommendations')
      .delete()
      .eq('student_id', studentId)
      .eq('approved', false)

    // Insert new recommendations (strip core_sports — not a DB column)
    const rows = scored.map(({ core_sports, ...s }) => ({
      ...s,
      student_id: studentId,
      approved: false,
      consultant_note: null,
    }))
    const { error: insertErr } = await supabase.from('student_recommendations').insert(rows)
    if (insertErr) throw insertErr

    // Send Telegram notification
    await sendTelegram(studentProfile, scored)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        count: scored.length,
        topScore: scored[0]?.score,
        student_id: studentId,
        academicStyle,
        schools: scored,
      })
    }

  } catch (err) {
    console.error('generate-recommendations error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
