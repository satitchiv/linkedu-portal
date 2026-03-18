// POST /api/add-camp-recommendation
// Manually add a camp to a student's recommendations (analyst only)
// Body: { student_id, camp (object with name, pageUrl, etc.) }
// The camp is added as approved=true, score=0 (manually selected)

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function parseGBP(text) {
  if (!text) return null
  const gbpMatch = text.match(/£([\d,]+)/)
  if (gbpMatch) return parseInt(gbpMatch[1].replace(/,/g, ''))
  const numMatch = text.match(/\b(\d[\d,]{2,})\b/)
  if (!numMatch) return null
  const num = parseInt(numMatch[1].replace(/,/g, ''))
  return isNaN(num) ? null : num
}

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
    const { student_id, camp } = JSON.parse(event.body || '{}')
    if (!student_id || !camp) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and camp required' }) }

    // Check student exists
    const { data: student, error: studentErr } = await supabase
      .from('students').select('id').eq('id', student_id).single()
    if (studentErr || !student) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Student not found' }) }

    const row = {
      student_id,
      notion_page_url:    camp.pageUrl || null,
      camp_name:          camp.name,
      programme_type:     camp.programmeType || null,
      city_location:      camp.cityLocation || null,
      programme_subjects: camp.programmeSubjects || null,
      eligible_ages:      camp.eligibleAges || null,
      residential_gbp:    parseGBP(camp.residentialGBP),
      non_residential_gbp: parseGBP(camp.nonResidentialGBP),
      period:             camp.period || null,
      brochure_url:       camp.brochureUrl || null,
      website_url:        camp.brochureUrl || null,
      score:              0,
      tier:               'consider',
      match_reasons:      ['Manually added by consultant'],
      approved:           true,
      approved_at:        new Date().toISOString(),
      consultant_note:    null,
    }

    const { data, error } = await supabase
      .from('student_camp_recommendations')
      .insert(row)
      .select()
      .single()

    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, recommendation: data }) }
  } catch (err) {
    console.error('add-camp-recommendation error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
