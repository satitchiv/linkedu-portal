// GET /api/student
// Returns full student data from Supabase for the authenticated parent
// Requires: Supabase JWT in Authorization header

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // Verify Supabase JWT
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    // Get user profile + student_id
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    const studentId = profile.student_id

    if (!studentId) {
      // No student linked yet — return empty shell so portal loads
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

    // Fetch all data in parallel
    const [
      studentRes,
      academicsRes,
      schoolsRes,
      timelineItemsRes,
      milestonesRes,
      documentsRes,
      golfRes,
      recsRes,
    ] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).single(),
      supabase.from('student_academics').select('*').eq('student_id', studentId).order('date', { ascending: false }),
      supabase.from('student_schools').select('*').eq('student_id', studentId).order('priority'),
      supabase.from('school_timeline_items').select('*').eq('student_id', studentId).order('date', { ascending: true, nullsFirst: false }),
      supabase.from('student_milestones').select('*').eq('student_id', studentId).order('date'),
      supabase.from('student_documents').select('*').eq('student_id', studentId).order('due_date'),
      supabase.from('golf_rounds').select('*').eq('student_id', studentId).order('date', { ascending: false }),
      supabase.from('student_recommendations').select('*').eq('student_id', studentId).order('score', { ascending: false }),
    ])

    // Merge timeline items onto schools
    const timelineItems = timelineItemsRes.data || []

    const s = studentRes.data || {}

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        student: {
          id:                s.id,
          studentName:       s.student_name || '',
          preferredName:     s.preferred_name || '',
          dob:               s.dob || null,
          nationality:       s.nationality || '',
          currentSchool:     s.current_school || '',
          currentYearGroup:  s.current_year_group || '',
          curriculum:        s.curriculum || '',
          englishLevel:      s.english_level || '',
          primarySport:      s.primary_sport || '',
          goal:              s.goal || '',
          destination:       s.destination || [],
          budgetGBP:         s.budget_gbp || null,
          targetEntryYear:   s.target_entry_year || '',
          targetYearGroup:   s.target_year_group || '',
          status:            s.status || 'active',
          stage:             s.stage || '',
          consultant:        s.assigned_consultant || '',
          consultantMessage: s.consultant_message || '',
          servicesActive:    s.services_active || [],
          photoUrl:          s.photo_url || null,
          parentName:        s.parent_name || '',
          parentEmail:       s.parent_email || '',
          parentPhone:       s.parent_phone || '',
        },
        academics: (academicsRes.data || []).map(a => ({
          id: a.id, subject: a.subject, term: a.term, date: a.date,
          grade: a.grade, score: a.score, maxScore: a.max_score,
          assessmentType: a.assessment_type, notes: a.notes,
        })),
        schools:    (schoolsRes.data || []).map(school => ({
          ...school,
          timeline_items: timelineItems.filter(item => item.student_school_id === school.id),
        })),
        milestones:      milestonesRes.data || [],
        documents:       documentsRes.data  || [],
        golfRounds:      golfRes.data       || [],
        recommendations: recsRes.data       || [],
        role:            profile.role,
      })
    }

  } catch (err) {
    console.error('student function error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
