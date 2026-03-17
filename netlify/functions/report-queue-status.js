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

  const jobId = event.queryStringParameters?.jobId
  if (!jobId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId required' }) }

  try {
    const { data, error } = await supabase
      .from('report_queue')
      .select('id, status, pdf_url, student_name, created_at, completed_at')
      .eq('id', jobId)
      .single()

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
