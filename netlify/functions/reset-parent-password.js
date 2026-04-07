// POST /api/reset-parent-password
// Generates a new temporary password for an existing parent account.
// Auth: analyst only (X-Admin-Secret or Supabase JWT with analyst/admin role).
// Body: { student_id }
// Finds parent's Supabase Auth account via user_profiles.student_id,
// updates the password, and returns new credentials for analyst to share.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Generate a readable 10-char password (no ambiguous chars: 0/O, 1/l/I)
function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let p = ''
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

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
    const isAdmin = await isAuthorizedAnalyst(event)
    if (!isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analyst access required' }) }
    }

    const { student_id } = JSON.parse(event.body || '{}')
    if (!student_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id is required' }) }
    }

    // Find the parent account linked to this student
    const { data: profile, error: profileErr } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('student_id', student_id)
      .eq('role', 'parent')
      .single()

    if (profileErr || !profile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No parent account found for this student — create one first using Create Password Login.' })
      }
    }

    const new_password = generatePassword()

    const { error: updateErr } = await supabase.auth.admin.updateUserById(profile.id, {
      password: new_password,
    })

    if (updateErr) throw updateErr

    console.log('reset-parent-password: ok', { student_id, email: profile.email })
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email: profile.email, new_password }) }

  } catch (err) {
    console.error('reset-parent-password error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
