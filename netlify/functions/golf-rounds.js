// GET  /api/golf-rounds?student_id=xxx  — fetch rounds
// POST /api/golf-rounds                  — save a round
// Requires: Supabase JWT in Authorization header

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Analyst-Pin',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    // ── Auth: X-Analyst-Pin OR Supabase JWT ──────────────────────────────────
    const analystPin = event.headers['x-analyst-pin'] || event.headers['X-Analyst-Pin']
    const isPinAuth  = analystPin && analystPin === process.env.ANALYST_PIN

    let user, profile
    if (isPinAuth) {
      // PIN auth — synthetic analyst profile, no JWT needed
      user    = { id: 'pin-auth' }
      profile = { role: 'analyst', student_id: null, notion_student_id: null }
    } else {
      // Verify Supabase JWT
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

      const { data: { user: u }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !u) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      user = u

      // Get user profile
      const { data: p } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!p) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }
      profile = p
    }

    // GET — fetch rounds
    if (event.httpMethod === 'GET') {
      const ownStudentId = profile.student_id || profile.notion_student_id
      const requestedId = event.queryStringParameters?.student_id || ownStudentId

      // Non-analysts can only fetch their own student's rounds
      if (profile.role !== 'analyst' && requestedId !== ownStudentId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
      }

      // Support both student_id (UUID) and notion_student_id
      let query = supabase.from('golf_rounds').select('*').order('date', { ascending: false })
      if (profile.student_id) {
        query = query.eq('student_id', requestedId)
      } else {
        query = query.eq('notion_student_id', requestedId)
      }
      const { data: rounds, error } = await query

      if (error) throw error

      return { statusCode: 200, headers, body: JSON.stringify({ rounds }) }
    }

    // POST — save a round
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const { notion_student_id, student_id: bodyStudentId, ...roundData } = body

      // Resolve target student — prefer UUID, fall back to notion_student_id
      const targetStudentUUID = bodyStudentId || profile.student_id || null
      const targetNotionId = notion_student_id || profile.notion_student_id || null

      // Non-analysts can only save for themselves
      if (profile.role !== 'analyst') {
        const ownUUID = profile.student_id
        const ownNotion = profile.notion_student_id
        if (targetStudentUUID && targetStudentUUID !== ownUUID) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
        }
        if (!targetStudentUUID && targetNotionId !== ownNotion) {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
        }
      }

      const { data, error } = await supabase
        .from('golf_rounds')
        .insert({
          student_id:        targetStudentUUID,
          notion_student_id: targetNotionId,
          entered_by_id: isPinAuth ? null : user.id,
          entered_by_role: profile.role,
          ...roundData
        })
        .select()
        .single()

      if (error) throw error

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, round: data }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  } catch (err) {
    console.error('golf-rounds error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
