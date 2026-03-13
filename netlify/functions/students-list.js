// GET /api/students-list
// Returns all students — analysts only
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

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    // ── Path 1: Admin secret ───────────────────────────────────────────────────
    const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
    if (!secret || secret !== process.env.ADMIN_SECRET) {
      // ── Path 2: Supabase JWT with analyst role ─────────────────────────────
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
      .select('id, student_name, preferred_name, parent_name, stage, status, target_entry_year, access_token, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        students: (students || []).map(s => ({
          id:              s.id,
          name:            s.preferred_name || s.student_name || 'Unknown',
          studentName:     s.student_name || '',
          parentName:      s.parent_name || '',
          stage:           s.stage || '',
          status:          s.status || 'active',
          targetEntryYear: s.target_entry_year || '',
          accessToken:     s.access_token || '',
          createdAt:       s.created_at || '',
        }))
      })
    }

  } catch (err) {
    console.error('students-list error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
