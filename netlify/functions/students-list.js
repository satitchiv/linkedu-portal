// GET /api/students-list
// Returns all students from Supabase — analysts only
// Auth: X-Admin-Secret header OR Supabase JWT with analyst role

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // ── Auth: X-Admin-Secret OR Supabase JWT analyst ──────────────────────────
    const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    const isAdmin = secret && secret === process.env.ADMIN_SECRET

    if (!isAdmin) {
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

      const { data: profile } = await supabase
        .from('user_profiles').select('role').eq('id', user.id).single()

      if (!profile || profile.role !== 'analyst') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
      }
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('id, student_name, preferred_name, notion_student_id, access_token, parent_name, parent_email, parent_phone, status, stage, target_entry_year, primary_sport, current_school, created_at, updated_at, services_active')
      .order('created_at', { ascending: false })

    if (error) throw error

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        students: (students || []).map(s => ({
          id:               s.id,
          name:             s.preferred_name || s.student_name || 'Unknown',
          studentName:      s.student_name || '',
          preferredName:    s.preferred_name || '',
          notionStudentId:  s.notion_student_id,
          accessToken:      s.access_token || '',
          parentName:       s.parent_name || '',
          parentEmail:      s.parent_email || '',
          parentPhone:      s.parent_phone || '',
          status:           s.status || 'active',
          stage:            s.stage || '',
          targetEntryYear:  s.target_entry_year || '',
          primarySport:     s.primary_sport || '',
          currentSchool:    s.current_school || '',
          servicesActive:   s.services_active || [],
          createdAt:        s.created_at,
          updatedAt:        s.updated_at,
        }))
      })
    }

  } catch (err) {
    console.error('students-list error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
