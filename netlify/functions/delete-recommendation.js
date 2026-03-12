// DELETE /api/delete-recommendation
// Deletes a recommendation by id. Consultant only.

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const secret = event.headers['x-admin-secret']
    if (secret !== process.env.ADMIN_SECRET) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const { id } = JSON.parse(event.body || '{}')
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }

    const { error } = await supabase.from('student_recommendations').delete().eq('id', id)
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('delete-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
