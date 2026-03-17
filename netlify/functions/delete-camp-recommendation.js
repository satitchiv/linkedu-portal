// DELETE /api/delete-camp-recommendation
// Deletes a camp recommendation by id. Analyst only.

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
  if (!['POST','DELETE'].includes(event.httpMethod)) return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const { id } = JSON.parse(event.body || '{}')
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }

    const { error } = await supabase.from('student_camp_recommendations').delete().eq('id', id)
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('delete-camp-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
