// POST /api/get-portal-link
// Generates parent access links (token link or email magic link)
// Auth: X-Admin-Secret required
// Body: { student_id, type: 'token' | 'regenerate' | 'magic' }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
const crypto = require('crypto')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { student_id, type } = JSON.parse(event.body || '{}')
    if (!student_id || !type) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and type required' }) }
    }

    const BASE = process.env.URL || 'https://linkedu-parent-portal.netlify.app'

    const { data: student, error: fetchErr } = await supabase
      .from('students').select('id, access_token, parent_email').eq('id', student_id).single()

    if (fetchErr || !student) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }
    }

    // ── Token link (no login required, no expiry) ──────────────────────────
    if (type === 'token') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          link: `${BASE}?token=${student.access_token}&view=parent`,
          type: 'token',
        })
      }
    }

    // ── Regenerate token (old link immediately stops working) ─────────────
    if (type === 'regenerate') {
      const newToken = crypto.randomBytes(8).toString('hex')
      const { error: updateErr } = await supabase
        .from('students').update({ access_token: newToken }).eq('id', student_id)
      if (updateErr) throw updateErr
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          link: `${BASE}?token=${newToken}&view=parent`,
          type: 'token',
          note: 'Previous link is now invalid.',
        })
      }
    }

    // ── Magic link (email-based, expires in 1 hour) ────────────────────────
    if (type === 'magic') {
      const email = student.parent_email
      if (!email) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: 'No parent_email set. Add it in the profile first.' })
        }
      }

      // generateLink creates the user if they don't exist, and returns a magic link
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: { redirectTo: `${BASE}?view=parent` }
      })

      if (linkErr) throw linkErr

      // Ensure user_profiles row exists so the portal can find the student
      const userId = linkData.user?.id
      if (userId) {
        await supabase.from('user_profiles').upsert(
          { id: userId, student_id, role: 'parent' },
          { onConflict: 'id' }
        )
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true,
          link: linkData.properties?.action_link,
          email,
          type: 'magic',
          note: 'Expires in 1 hour. Parent clicks once — no password needed.',
        })
      }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'type must be: token, regenerate, or magic' }) }

  } catch (err) {
    console.error('get-portal-link error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
