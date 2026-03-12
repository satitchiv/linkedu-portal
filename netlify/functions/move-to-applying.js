// POST /api/move-to-applying
// Moves a recommendation into the student_schools (applying) table. Consultant only.

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

    const { rec_id } = JSON.parse(event.body || '{}')
    if (!rec_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'rec_id required' }) }

    // Fetch the recommendation
    const { data: rec, error: fetchErr } = await supabase
      .from('student_recommendations')
      .select('*')
      .eq('id', rec_id)
      .single()
    if (fetchErr || !rec) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Recommendation not found' }) }

    // Check not already in student_schools
    const { data: existing } = await supabase
      .from('student_schools')
      .select('id')
      .eq('student_id', rec.student_id)
      .eq('school_name', rec.school_name)
      .single()

    if (existing) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Already in applying list' }) }
    }

    // Insert into student_schools
    const { error: insertErr } = await supabase.from('student_schools').insert({
      student_id:         rec.student_id,
      school_name:        rec.school_name,
      country:            'UK',
      application_status: 'considering',
      priority:           rec.tier === 'strong_match' ? 'high' : rec.tier === 'good_match' ? 'medium' : 'low',
      annual_fee_gbp:     rec.fee || null,
      notes:              rec.consultant_note || null,
      fit_score:          rec.score ? Math.round(rec.score / 10) : null,
    })
    if (insertErr) throw insertErr

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
  } catch (err) {
    console.error('move-to-applying error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
