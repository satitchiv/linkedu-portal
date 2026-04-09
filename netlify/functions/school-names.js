// GET /api/school-names
// Returns distinct school names from student_schools, sorted alphabetically.
// Analyst-only.

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
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!(await isAuthorizedAnalyst(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { data, error } = await supabase
      .from('student_schools')
      .select('school_name')
      .order('school_name', { ascending: true })

    if (error) throw error

    // Deduplicate (Supabase JS client doesn't expose DISTINCT directly)
    const names = [...new Set((data || []).map(r => r.school_name).filter(Boolean))].sort()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ names }),
    }
  } catch (err) {
    console.error('school-names error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    }
  }
}
