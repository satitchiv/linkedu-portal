// POST /api/create-parent-account
// Creates a Supabase Auth account for a parent, linked to an existing student.
// Auth: analyst only (X-Admin-Secret or Supabase JWT with analyst/admin role).
// Returns: { ok: true, email, default_password } — analyst shares credentials with parent.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    // ── Analyst-only auth check ──────────────────────────────────────────────
    const isAdmin = await isAuthorizedAnalyst(event)
    if (!isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analyst access required' }) }
    }

    const { student_id, email, default_password } = JSON.parse(event.body || '{}')

    if (!student_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id is required' }) }
    }
    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No email on file — use the token link instead.' }) }
    }
    if (!default_password || default_password.length < 8) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password must be at least 8 characters' }) }
    }

    // Verify student exists
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .select('id, parent_email')
      .eq('id', student_id)
      .single()

    if (stuErr || !student) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }
    }

    // Create Supabase Auth user — email_confirm:true skips confirmation email
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: default_password,
      email_confirm: true,
    })

    if (authErr) {
      if (authErr.message && (authErr.message.includes('already') || authErr.message.includes('duplicate') || authErr.message.includes('exists'))) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'An account with this email already exists' }) }
      }
      return { statusCode: 400, headers, body: JSON.stringify({ error: authErr.message }) }
    }

    const user = authData.user
    if (!user) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'User creation failed' }) }
    }

    // Upsert user_profiles row linking auth user to student
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        student_id,
        role: 'parent',
      }, { onConflict: 'id' })

    if (profileErr) {
      console.error('create-parent-account profile upsert error:', profileErr.message)
    }

    console.log('create-parent-account: created', { student_id, email: user.email })
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email, default_password }) }

  } catch (err) {
    console.error('create-parent-account error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
