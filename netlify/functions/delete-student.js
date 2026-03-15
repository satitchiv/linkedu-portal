// DELETE /api/delete-student
// Permanently deletes a student and all related records — analyst only
// Body: { student_id: "uuid" }

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
  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const body = JSON.parse(event.body || '{}')
    const { student_id } = body
    if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }

    // Delete related records first (foreign key order)
    await supabase.from('document_extractions').delete().eq('student_id', student_id)
    await supabase.from('student_certifications').delete().eq('student_id', student_id)
    await supabase.from('student_academics').delete().eq('student_id', student_id)
    await supabase.from('school_timeline_items').delete().eq('student_id', student_id)
    await supabase.from('student_schools').delete().eq('student_id', student_id)
    await supabase.from('student_milestones').delete().eq('student_id', student_id)
    await supabase.from('student_documents').delete().eq('student_id', student_id)
    await supabase.from('golf_rounds').delete().eq('student_id', student_id)
    await supabase.from('student_recommendations').delete().eq('student_id', student_id)

    // Delete the student record itself
    const { error } = await supabase.from('students').delete().eq('id', student_id)
    if (error) throw error

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('delete-student error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
