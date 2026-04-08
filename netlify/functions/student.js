// GET /api/student
// Returns student data. Three auth paths:
//   1. X-Access-Token header — token link (parent view, read-only)
//   2. Authorization: Bearer <jwt> — Supabase JWT (parent or analyst account)
//   3. (write ops handled by update-student.js with X-Admin-Secret)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Fetch all student-related data in parallel given a student_id
async function fetchStudentData(studentId) {
  const [
    studentRes,
    academicsRes,
    schoolsRes,
    timelineItemsRes,
    milestonesRes,
    documentsRes,
    golfRes,
    recsRes,
    certificationsRes,
    extractionsRes,
    campRecsRes,
    campAppsRes,
    campTlRes,
  ] = await Promise.all([
    supabase.from('students').select('*').eq('id', studentId).single(),
    supabase.from('student_academics').select('*').eq('student_id', studentId).order('date', { ascending: false }),
    supabase.from('student_schools').select('*').eq('student_id', studentId).order('priority'),
    supabase.from('school_timeline_items').select('*').eq('student_id', studentId).order('date', { ascending: true, nullsFirst: false }),
    supabase.from('student_milestones').select('*').eq('student_id', studentId).order('date'),
    supabase.from('student_documents').select('*').eq('student_id', studentId).order('due_date'),
    supabase.from('golf_rounds').select('*').eq('student_id', studentId).order('date', { ascending: false }),
    supabase.from('student_recommendations').select('*').eq('student_id', studentId).order('score', { ascending: false }),
    supabase.from('student_certifications').select('*').eq('student_id', studentId).order('date', { ascending: false, nullsFirst: false }),
    supabase.from('document_extractions').select('*').eq('student_id', studentId).order('extracted_at', { ascending: false }),
    supabase.from('student_camp_recommendations').select('*').eq('student_id', studentId).order('score', { ascending: false }),
    supabase.from('student_camp_applications').select('*').eq('student_id', studentId).order('created_at', { ascending: true }),
    supabase.from('camp_timeline_items').select('*').eq('student_id', studentId).order('date', { ascending: true, nullsFirst: false }),
  ])

  const s = studentRes.data || {}
  const timelineItems = timelineItemsRes.data || []

  const campTlItems = campTlRes.data || []
  const campAppsWithTl = (campAppsRes.data || []).map(app => ({
    ...app,
    timeline_items: campTlItems.filter(i => i.camp_application_id === app.id),
  }))
  return { s, academicsRes, schoolsRes, timelineItems, milestonesRes, documentsRes, golfRes, recsRes, certificationsRes, extractionsRes, campRecsRes, campAppsWithTl }
}

// Build the student object — pass isParent=true to strip admin-only fields
function buildStudentObj(s, isParent) {
  const obj = {
    id:                      s.id,
    studentName:             s.student_name || '',
    preferredName:           s.preferred_name || '',
    dob:                     s.dob || null,
    nationality:             s.nationality || '',
    currentSchool:           s.current_school || '',
    currentYearGroup:        s.current_year_group || '',
    curriculum:              s.curriculum || '',
    englishLevel:            s.english_level || '',
    primarySport:            s.primary_sport || '',
    goal:                    s.goal || '',
    destination:             s.destination || [],
    budgetGBP:               s.budget_gbp || null,
    summerCampBudget:        s.summer_camp_budget_gbp || null,
    targetEntryYear:         s.target_entry_year || '',
    targetYearGroup:         s.target_year_group || '',
    status:                  s.status || 'active',
    stage:                   s.stage || '',
    consultant:              s.assigned_consultant || '',
    consultantMessage:       s.consultant_message || '',
    servicesActive:          s.services_active || [],
    photoUrl:                s.photo_url || null,
    parentName:              s.parent_name || '',
    parentEmail:             s.parent_email || '',
    parentPhone:             s.parent_phone || '',
    sportNotes:              s.sport_notes || '',
    academicNotes:           s.academic_notes || '',
    certNotes:               s.cert_notes || '',
    servicesInterested:      s.services_interested || [],
    schoolTypesInterested:   s.school_types_interested || [],
    coursesInterested:       s.courses_interested || [],
    heardFrom:               s.heard_from || '',
    referralNote:            s.referral_note || '',
    show_golf_to_parent:     s.show_golf_to_parent || false,
    show_reports_to_parent:  s.show_reports_to_parent || false,
    show_tennis_to_parent:   s.show_tennis_to_parent || false,
  }
  // Admin-only fields — never exposed via token link or parent JWT
  if (!isParent) {
    obj.consultantNotes = s.consultant_notes || ''
    obj.access_token    = s.access_token     || null  // needed for LINE deep link generation
    obj.line_user_id    = s.line_user_id     || null  // shows linked/not-linked status in portal
  }
  return obj
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    // ── Path 1: Token link (X-Access-Token header) ─────────────────────────
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()

      if (error || !student) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired link' }) }
      }

      const { s, academicsRes, schoolsRes, timelineItems, milestonesRes, documentsRes, golfRes, recsRes, certificationsRes, extractionsRes, campRecsRes, campAppsWithTl } =
        await fetchStudentData(student.id)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          student: buildStudentObj(s, true),   // token view — parent access, strip analyst-only fields
          academics: (academicsRes.data || []).map(a => ({
            id: a.id, subject: a.subject, term: a.term, date: a.date,
            grade: a.grade, score: a.score, maxScore: a.max_score,
            assessmentType: a.assessment_type, notes: a.notes,
          })),
          schools: (schoolsRes.data || []).map(sc => ({
            ...sc,
            timeline_items: timelineItems.filter(item => item.student_school_id === sc.id),
          })),
          milestones:            milestonesRes.data   || [],
          documents:             documentsRes.data     || [],
          golfRounds:            golfRes.data          || [],
          recommendations:       recsRes.data          || [],
          certifications:        certificationsRes.data || [],
          extractions:           extractionsRes.data   || [],
          camp_recommendations:  campRecsRes.data      || [],
          camp_applications:     campAppsWithTl,
          role: 'parent',
        })
      }
    }

    // ── Path 2: Supabase JWT ───────────────────────────────────────────────
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    // Analysts may request a specific student via ?student_id= query param
    const queryStudentId = event.queryStringParameters && event.queryStringParameters.student_id
    let studentIdToFetch = profile.student_id

    if (queryStudentId && profile.role === 'analyst') {
      studentIdToFetch = queryStudentId
    }

    if (!studentIdToFetch) {
      // Free-tier user — no student record, return tool results only
      if (profile.account_type === 'free') {
        const { data: toolResults } = await supabase
          .from('saved_tool_results')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            role: 'free',
            student: null,
            toolResults: toolResults || [],
          })
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          student: { studentName: '', status: 'new' },
          academics: [], schools: [], milestones: [], documents: [],
          role: profile.role,
          setupRequired: true,
        })
      }
    }

    const [
      studentData,
      toolResultsRes,
    ] = await Promise.all([
      fetchStudentData(studentIdToFetch),
      supabase.from('saved_tool_results').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
    ])

    const { s, academicsRes, schoolsRes, timelineItems, milestonesRes, documentsRes, golfRes, recsRes, certificationsRes, extractionsRes, campRecsRes, campAppsWithTl } = studentData

    const isParent = profile.role === 'parent'

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        student: buildStudentObj(s, isParent),
        academics: (academicsRes.data || []).map(a => ({
          id: a.id, subject: a.subject, term: a.term, date: a.date,
          grade: a.grade, score: a.score, maxScore: a.max_score,
          assessmentType: a.assessment_type, notes: a.notes,
        })),
        schools: (schoolsRes.data || []).map(sc => ({
          ...sc,
          timeline_items: timelineItems.filter(item => item.student_school_id === sc.id),
        })),
        milestones:            milestonesRes.data   || [],
        documents:             documentsRes.data     || [],
        golfRounds:            golfRes.data          || [],
        recommendations:       recsRes.data          || [],
        certifications:        certificationsRes.data || [],
        extractions:           extractionsRes.data   || [],
        camp_recommendations:  campRecsRes.data      || [],
        camp_applications:     campAppsWithTl        || [],
        toolResults:           toolResultsRes.data   || [],
        role: profile.role,
      })
    }

  } catch (err) {
    console.error('student function error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
