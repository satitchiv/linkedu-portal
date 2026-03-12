// POST /api/approve-recommendations
// Saves consultant approvals + notes for a student's recommendations
// Requires: X-Admin-Secret header

const { createClient } = require('@supabase/supabase-js')

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const adminSecret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const { student_id, approvals } = JSON.parse(event.body || '{}')
    // approvals = [{ school_id, approved, consultant_note }]

    if (!student_id || !Array.isArray(approvals)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and approvals required' }) }
    }

    // Update each recommendation — match by row id (school_id field contains the rec row uuid)
    await Promise.all(approvals.map(a =>
      supabase.from('student_recommendations')
        .update({
          approved:        a.approved,
          consultant_note: a.consultant_note || null,
          approved_at:     a.approved ? new Date().toISOString() : null,
        })
        .eq('id', a.school_id)
    ))

    const approvedCount = approvals.filter(a => a.approved).length

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, approvedCount })
    }

  } catch (err) {
    console.error('approve-recommendations error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
