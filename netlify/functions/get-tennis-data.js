// GET /api/get-tennis-data
// Returns all tennis data for a student in one call: profile, matches, tournaments, rankings, notes, stats.
// Auth: X-Access-Token (token link) or Authorization: Bearer <jwt>
// Analysts may pass ?student_id= to view another student's data.

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Compute stats from raw match data (server-side — never on frontend)
async function computeStats(studentId) {
  const currentYear = new Date().getFullYear()

  const [allMatches, rankingsResult, tournamentsResult] = await Promise.all([
    supabase.from('tennis_matches').select('result, match_date').eq('student_id', studentId),
    supabase.from('tennis_rankings').select('id').eq('student_id', studentId),
    supabase
      .from('tennis_tournaments')
      .select('id')
      .eq('student_id', studentId)
      .eq('status', 'completed')
      .gte('start_date', `${currentYear}-01-01`)
      .lte('start_date', `${currentYear}-12-31`),
  ])

  const matches = allMatches.data || []
  const totalMatches = matches.length
  const wins = matches.filter(m => m.result === 'win').length
  const losses = matches.filter(m => m.result === 'loss').length
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0
  const matchesThisYear = matches.filter(m => {
    if (!m.match_date) return false
    return new Date(m.match_date).getFullYear() === currentYear
  }).length
  const tournamentsThisYear = (tournamentsResult.data || []).length

  return { totalMatches, wins, losses, winRate, matchesThisYear, tournamentsThisYear }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    let studentId = null

    // ── Auth path 1: X-Access-Token (token link) ───────────────────────────────
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired link' }) }
      studentId = student.id
    } else {
      // ── Auth path 2: Supabase JWT ────────────────────────────────────────────
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      const { data: profile } = await supabase
        .from('user_profiles').select('student_id, role').eq('id', user.id).single()
      if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }
      // Analysts may request a specific student via ?student_id= query param
      const qsStudentId = event.queryStringParameters?.student_id
      if (qsStudentId && (profile.role === 'analyst' || profile.role === 'admin')) {
        studentId = qsStudentId
      } else {
        studentId = profile.student_id
      }
    }

    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No student linked to this session' }) }

    // ── Fetch all tennis data in parallel ─────────────────────────────────────
    const [profileResult, matchesResult, tournamentsResult, rankingsResult, notesResult, stats] = await Promise.all([
      supabase.from('tennis_profiles').select('*').eq('student_id', studentId).single(),
      supabase
        .from('tennis_matches')
        .select('*')
        .eq('student_id', studentId)
        .order('match_date', { ascending: false })
        .limit(50),
      supabase
        .from('tennis_tournaments')
        .select('*')
        .eq('student_id', studentId)
        .order('start_date', { ascending: true }),
      supabase
        .from('tennis_rankings')
        .select('*')
        .eq('student_id', studentId)
        .order('log_date', { ascending: true }),
      supabase
        .from('tennis_notes')
        .select('*')
        .eq('student_id', studentId)
        .order('note_date', { ascending: false })
        .limit(30),
      computeStats(studentId),
    ])

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profile:     profileResult.data || null,
        matches:     matchesResult.data || [],
        tournaments: tournamentsResult.data || [],
        rankings:    rankingsResult.data || [],
        notes:       notesResult.data || [],
        stats,
      }),
    }

  } catch (err) {
    console.error('get-tennis-data error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
