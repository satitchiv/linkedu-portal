// POST /api/promote-free-user
// Creates a minimal student record for a free user and returns their portal access token.
// Auth: X-Admin-Secret header OR analyst JWT

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Validate body ─────────────────────────────────────────────────────────
    const body = JSON.parse(event.body || '{}')
    const { user_id, email, student_name, parent_name } = body

    if (!email || !student_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'email and student_name are required' }) }
    }

    // ── Generate unique portal access token ───────────────────────────────────
    const accessToken = crypto.randomBytes(8).toString('hex')

    // ── Create student record ─────────────────────────────────────────────────
    const { data: student, error: insertErr } = await supabase
      .from('students')
      .insert({
        student_name: student_name.trim(),
        parent_name: (parent_name || student_name).trim(),
        parent_email: email,
        access_token: accessToken,
        status: 'active',
        stage: 'researching',
      })
      .select('id, access_token')
      .single()

    if (insertErr) throw insertErr

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ access_token: accessToken, student_id: student.id }),
    }

  } catch (err) {
    console.error('promote-free-user error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    }
  }
}
