// POST /api/claim-account
// Parent using a token link creates their own email+password credentials.
// Auth: X-Access-Token header (the same token from their portal URL)
// Body: { email, password }

const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sendWelcomeEmail(to, parentName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from: 'LINKEDU <noreply@linkedu.hk>',
      to: [to],
      subject: 'Your LINKEDU portal access',
      text: [
        `Hi ${parentName},`,
        '',
        'Your LINKEDU portal account is ready.',
        '',
        `Email: ${to}`,
        'Sign in at: https://linkedu-parent-portal.netlify.app',
        '',
        'If you forget your password, use "Forgot password?" on the sign-in page.',
        '',
        '— The LINKEDU Team',
      ].join('\n'),
    })
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = ''
        res.on('data', d => (data += d))
        res.on('end', () => resolve(JSON.parse(data)))
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

exports.handler = async event => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const accessToken =
      event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (!accessToken)
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    // Verify token → find student
    const { data: student, error: stuErr } = await supabase
      .from('students')
      .select('id, preferred_name, student_name, parent_name')
      .eq('access_token', accessToken)
      .single()

    if (stuErr || !student)
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { email, password } = JSON.parse(event.body || '{}')
    if (!email)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email required' }) }
    if (!password || password.length < 8)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Password must be at least 8 characters' }),
      }

    // Create Supabase Auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authErr) {
      const msg = authErr.message || ''
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Email already in use' }) }
      }
      throw authErr
    }

    // Link user to student
    await supabase.from('user_profiles').upsert({
      id: authData.user.id,
      role: 'parent',
      student_id: student.id,
    })

    // Send welcome email — non-blocking, never fails the response
    if (process.env.RESEND_API_KEY) {
      const parentName = student.parent_name || student.preferred_name || student.student_name || 'there'
      sendWelcomeEmail(email, parentName).catch(e =>
        console.error('Welcome email error:', e.message)
      )
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email }) }
  } catch (err) {
    console.error('claim-account error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    }
  }
}
