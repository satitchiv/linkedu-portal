// POST /api/move-to-applying
// Moves a recommendation into student_schools with status 'applying'.
// Copies match_reasons, region, school_type, sports, has_scholarship from the
// recommendation row so the card retains context after the rec is dismissed.
// Requires: X-Admin-Secret header

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { recommendation_id, student_id, priority } = body

    if (!recommendation_id || !student_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'recommendation_id and student_id are required' }) }
    }

    // Fetch the recommendation row
    const { data: rec, error: recErr } = await supabase
      .from('student_recommendations')
      .select('*')
      .eq('id', recommendation_id)
      .single()

    if (recErr || !rec) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Recommendation not found' }) }
    }

    // Insert into student_schools, copying enrichment fields from the rec
    const insert = {
      student_id,
      school_name:          rec.school_name,
      country:              rec.country || 'UK',
      application_status:   'applying',
      priority:             priority || rec.priority || 'medium',
      annual_fee_gbp:       rec.annual_fee_gbp || null,
      fit_score:            rec.fit_score || null,
      notes:                rec.notes || null,
      // Enrichment fields copied from recommendation
      match_reasons:        rec.match_reasons || [],
      region:               rec.region || null,
      school_type:          rec.school_type || null,
      sports:               rec.sports || [],
      has_scholarship:      rec.has_scholarship || false,
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('student_schools')
      .insert(insert)
      .select()
      .single()

    if (insertErr) throw insertErr

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, student_school: inserted }),
    }

  } catch (err) {
    console.error('move-to-applying error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
