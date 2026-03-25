// POST /api/free-signup
// Creates a free-tier Supabase user account.
// Body: { email, password, name? }
// Returns: { ok: true } on success, { error: 'already_exists' } if duplicate.

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const { email, password, name } = JSON.parse(event.body || '{}')

    if (!email || !password) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password required' }) }
    }

    // Create Supabase auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authErr) {
      // Duplicate email — user already exists
      if (authErr.message && (authErr.message.includes('already') || authErr.message.includes('duplicate') || authErr.message.includes('exists'))) {
        return { statusCode: 200, headers, body: JSON.stringify({ error: 'already_exists' }) }
      }
      return { statusCode: 400, headers, body: JSON.stringify({ error: authErr.message }) }
    }

    const user = authData.user
    if (!user) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'User creation failed' }) }
    }

    // Insert user_profiles row
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .insert({
        id: user.id,
        email: user.email,
        parent_name: name || null,
        account_type: 'free',
        role: 'parent',
        created_at: new Date().toISOString(),
      })

    if (profileErr) {
      // Profile insert failed — not fatal, user was created
      console.error('Profile insert error:', profileErr.message)
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('free-signup error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
