// POST /api/save-academics
// Saves extracted academic grades to student_academics table
// Also optionally updates student profile fields
// Requires: Supabase JWT in Authorization header

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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles').select('*').eq('id', user.id).single()

    if (!profile || !profile.student_id) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No student linked to this account' }) }
    }

    const body = JSON.parse(event.body || '{}')
    const { grades, term, academicYear, profileUpdates } = body

    if (!grades || !Array.isArray(grades) || grades.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'grades array is required' }) }
    }

    // Build date from academicYear (use Jan 1 of the end year, or today)
    let recordDate = new Date().toISOString().split('T')[0]
    if (academicYear) {
      const yearMatch = academicYear.match(/(\d{4})/)
      if (yearMatch) recordDate = `${yearMatch[1]}-06-30`
    }

    // Insert academic records
    const rows = grades
      .filter(g => g.subject && (g.grade || g.score !== null))
      .map(g => ({
        student_id:      profile.student_id,
        subject:         g.subject,
        grade:           g.grade || null,
        score:           g.score !== null && g.score !== undefined ? parseFloat(g.score) : null,
        max_score:       g.maxScore !== null && g.maxScore !== undefined ? parseFloat(g.maxScore) : null,
        term:            term || null,
        date:            recordDate,
        assessment_type: 'Report Card',
        notes:           academicYear ? `Academic year ${academicYear}` : null,
      }))

    const { error: insertError } = await supabase
      .from('student_academics')
      .insert(rows)

    if (insertError) throw insertError

    // Optionally update student profile fields (parent-editable only)
    const PARENT_EDITABLE = new Set([
      'student_name', 'preferred_name', 'dob', 'nationality',
      'current_school', 'current_year_group', 'curriculum', 'english_level',
      'primary_sport', 'goal', 'destination', 'budget_gbp', 'target_entry_year', 'photo_url',
    ])

    if (profileUpdates && typeof profileUpdates === 'object') {
      const updates = {}
      for (const [key, val] of Object.entries(profileUpdates)) {
        if (PARENT_EDITABLE.has(key) && val !== null && val !== undefined && val !== '') {
          updates[key] = val
        }
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString()
        const { error: updateError } = await supabase
          .from('students')
          .update(updates)
          .eq('id', profile.student_id)
        if (updateError) console.warn('Profile update partial fail:', updateError.message)
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, inserted: rows.length })
    }

  } catch (err) {
    console.error('save-academics error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
