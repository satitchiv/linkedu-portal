// POST /api/add-recommendation
// Manually adds a school to a student's recommendations (even if below algorithm cutoff)
// Requires: X-Admin-Secret header

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SCHOOLS = require(path.join(__dirname, '../../data/schools.json'))

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { student_id, school_name, consultant_note } = JSON.parse(event.body || '{}')

    if (!student_id || !school_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and school_name required' }) }
    }

    // Fuzzy match school name against schools.json
    // Priority 1: school name contains the search term (e.g. "Millfield School" contains "millfield")
    // Priority 2: search term contains the school's first word (looser fallback)
    const nameLower = school_name.toLowerCase()
    const school =
      SCHOOLS.find(s => s.name.toLowerCase().includes(nameLower)) ||
      SCHOOLS.find(s => nameLower.includes(s.name.toLowerCase().split(' ')[0]) && s.name.toLowerCase().split(' ')[0].length > 4)

    if (!school) {
      // List closest matches to help
      const close = SCHOOLS
        .filter(s => s.name.toLowerCase().split(' ').some(w => nameLower.includes(w) && w.length > 3))
        .slice(0, 5)
        .map(s => s.name)
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: `School "${school_name}" not found in database`,
          suggestions: close
        })
      }
    }

    // Check if already in recommendations
    const { data: existing } = await supabase
      .from('student_recommendations')
      .select('school_id')
      .eq('student_id', student_id)
      .eq('school_id', school.id)
      .single()

    if (existing) {
      // Already exists — just approve it and update note
      await supabase
        .from('student_recommendations')
        .update({ approved: true, consultant_note: consultant_note || null, approved_at: new Date().toISOString() })
        .eq('student_id', student_id)
        .eq('school_id', school.id)

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, action: 'updated', school_name: school.name }) }
    }

    // Insert as new manually-added recommendation
    const row = {
      student_id,
      school_id:       school.id,
      school_name:     school.name,
      school_slug:     school.slug,
      score:           0,   // manual add — no algorithm score
      tier:            'strong_match',
      fee:             school.fee || null,
      region:          school.region || null,
      school_type:     school.type || null,
      sports:          school.sports || [],
      has_scholarship: !!(school.schol && school.schol.length > 5),
      match_reasons:   ['Manually added by consultant'],
      approved:        true,
      consultant_note: consultant_note || null,
      approved_at:     new Date().toISOString(),
    }

    const { error } = await supabase.from('student_recommendations').insert(row)
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, action: 'added', school_name: school.name }) }

  } catch (err) {
    console.error('add-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
