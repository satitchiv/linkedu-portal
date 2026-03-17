// GET /api/report-queue-status?jobId=uuid
// Returns the current status of a report generation job.
// No auth required — jobId is the effective token (UUID).

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const jobId     = event.queryStringParameters?.jobId
  const studentId = event.queryStringParameters?.studentId

  if (!jobId && !studentId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId or studentId required' }) }
  }

  try {
    let query = supabase
      .from('report_queue')
      .select('id, status, pdf_url, student_name, created_at, completed_at')

    if (jobId) {
      query = query.eq('id', jobId)
    } else {
      // Latest done job with a PDF for this student
      query = query
        .eq('student_id', studentId)
        .eq('status', 'done')
        .not('pdf_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
    }

    const { data, error } = await query.single()

    if (error || !data) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: data.status,
        pdf_url: data.pdf_url || null,
        student_name: data.student_name,
        created_at: data.created_at,
        completed_at: data.completed_at || null,
      }),
    }
  } catch (err) {
    console.error('report-queue-status error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
