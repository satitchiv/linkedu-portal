// POST /api/add-school-to-applying
// Analyst only. Inserts a school directly into student_schools at 'researching' stage.
// Used when adding a timeline item from Communications for a school not yet in Applying.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { student_id, school_name } = JSON.parse(event.body || '{}')
    if (!student_id || !school_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and school_name required' }) }
    }

    // Check it doesn't already exist (race condition guard)
    const { data: existing } = await supabase
      .from('student_schools')
      .select('id')
      .eq('student_id', student_id)
      .ilike('school_name', school_name)
      .single()

    if (existing) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student_school: existing, already_existed: true }) }
    }

    const { data: inserted, error } = await supabase
      .from('student_schools')
      .insert({
        student_id,
        school_name,
        country: 'UK',
        application_status: 'researching',
        priority: 'medium',
      })
      .select()
      .single()

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, student_school: inserted, already_existed: false }) }

  } catch (err) {
    console.error('add-school-to-applying error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
