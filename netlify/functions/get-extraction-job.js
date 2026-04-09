// GET /api/get-extraction-job?jobId=<uuid>
// Analyst-only. Returns the status and result of an extraction job.
// Poll every 2s until status is 'done' or 'error'.
// Returns {status:'pending'} if job not yet created (race-condition window after submit).

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
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!(await isAuthorizedAnalyst(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const jobId = event.queryStringParameters?.jobId
  if (!jobId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId is required' }) }
  }

  const { data: job, error } = await supabase
    .from('extraction_jobs')
    .select('id, status, file_name, result, error_msg, created_at, updated_at')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    // Job not created yet — brief race window after submit
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, job: { id: jobId, status: 'pending' } }),
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, job }),
  }
}
