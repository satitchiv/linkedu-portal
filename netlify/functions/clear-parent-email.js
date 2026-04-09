// POST /api/clear-parent-email
// Analyst-only. Removes the real email from the parent auth account linked to a student
// by replacing it with a placeholder. The account still exists (parent_students link intact)
// but email/password sign-in is no longer possible until a new email is set.
// Body: { student_id }
// Returns: { ok }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

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
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event))
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    const { student_id } = JSON.parse(event.body || '{}')
    if (!student_id)
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Find parent linked to this student
    const { data: link } = await supabase
      .from('parent_students')
      .select('parent_user_id')
      .eq('student_id', student_id)
      .limit(1)
      .single()

    if (!link)
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No parent account linked to this student' }) }

    // Replace email with a placeholder so no real email is tied to the account
    const placeholder = `unlinked_${link.parent_user_id.slice(0, 8)}@noemail.invalid`
    const { error: updateErr } = await supabase.auth.admin.updateUserById(link.parent_user_id, {
      email: placeholder,
    })

    if (updateErr)
      return { statusCode: 500, headers, body: JSON.stringify({ error: updateErr.message }) }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    }
  } catch (err) {
    console.error('clear-parent-email error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
