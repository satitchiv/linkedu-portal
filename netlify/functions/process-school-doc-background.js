// POST /api/process-school-doc-background
// Analyst-only. Accepts pdfBase64 + jobId (client-generated UUID) + optional student context.
// Runs as a Netlify background function — Netlify returns 202 immediately, function continues.
// Stores result in extraction_jobs for polling via /api/get-extraction-job.

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')
const fs   = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getGeminiKey() {
  const envKey = process.env.GEMINI_API_KEY
  if (envKey && envKey.startsWith('AIza')) return envKey
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const match = envFile.match(/^GEMINI_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch (e) {}
  return envKey
}

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

  if (!(await isAuthorizedAnalyst(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let jobId
  try {
    const body = JSON.parse(event.body || '{}')
    const { pdfBase64, jobId: clientJobId, fileName, studentName, studentSchools } = body

    if (!clientJobId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'jobId is required' }) }
    }
    if (!pdfBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'pdfBase64 is required' }) }
    }
    if (pdfBase64.length > 6_200_000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large. Keep documents under 4.5MB.' }) }
    }

    jobId = clientJobId

    // Create job record (upsert in case polling checks before we insert)
    await supabase.from('extraction_jobs').upsert({
      id: jobId,
      status: 'processing',
      file_name: fileName || 'document.pdf',
      updated_at: new Date().toISOString(),
    })

    const geminiKey = getGeminiKey()
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const studentCtx = studentName ? `Student context: ${studentName}` : 'No specific student context provided.'
    const schoolsCtx = studentSchools && studentSchools.length
      ? `Student's schools: ${studentSchools.join(', ')}`
      : 'No school list provided.'

    const prompt = `Extract all actionable data from this school/student document. Return ONLY raw JSON.
${studentCtx}
${schoolsCtx}

{"items":[{"id":"item-1","title":"...","value":"...","valueType":"date|text|number|list","destination":"...","schoolName":"...or null","studentMentioned":"...or null","confidence":"high|medium|low","notes":"...or null","meta":{"subject":"profile_academic only","grade":"...","score":"...","maxScore":"...","term":"...","category":"english_test|standardised_test|sport|academic_award|extracurricular|other","certName":"...","issuer":"...","expiryDate":"YYYY-MM-DD or null","field":"profile_basic only: student_name|preferred_name|dob|nationality|current_school|current_year_group","eventType":"term_start|term_end|half_term_start|half_term_end|exeat|key_event"}}],"schoolDetected":"...or null","studentMentioned":"...or null","academicYear":"...or null"}

Destinations:
timeline=dated school events (one item per date)
deadline=application/registration cutoffs
profile_basic=student details stated in doc (name/dob/nationality/school/year); meta.field=DB key
profile_dob=date of birth only
profile_academic=subject-level grade summary only (one item per subject — NOT individual criteria/checklist items); for each: meta.grade=letter grade if any, meta.score=numeric value if any, item.notes=any descriptive context (e.g. "93rd percentile", "Pass", "national average 220"); standardised test scores (MAP/NWEA/IELTS etc) each count as one subject
profile_cert=IELTS/TOEFL/certificates
school_info=info shared across all students (visa/uniform/boarding/insurance/policies)
etc=anything else

Rules: dates=YYYY-MM-DD, never guess dates, one item per timeline event, extract both school_info and student-specific items, for profile_basic extract student name/school/year group if explicitly stated in document, for profile_academic group by subject and ignore individual assessment criteria rows (single letter marks on a checklist), return raw JSON only.`

    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      { text: prompt }
    ])

    const candidate = result.response.candidates?.[0]
    if (!candidate) {
      const blockReason = result.response.promptFeedback?.blockReason || 'unknown'
      throw new Error(`Gemini blocked the request: ${blockReason}`)
    }
    const finishReason = candidate.finishReason
    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(`Gemini stopped with reason: ${finishReason}`)
    }

    const raw = result.response.text().trim()

    let extracted
    try {
      extracted = JSON.parse(raw)
    } catch (parseErr) {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          extracted = JSON.parse(match[0])
        } catch (e2) {
          throw new Error('Gemini returned unparseable JSON. Raw: ' + raw.slice(0, 300))
        }
      } else {
        throw new Error('Gemini returned non-JSON. Raw: ' + raw.slice(0, 300))
      }
    }

    if (!Array.isArray(extracted.items)) extracted.items = []

    await supabase.from('extraction_jobs').update({
      status: 'done',
      result: { extracted, fileName: fileName || 'document.pdf' },
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    return { statusCode: 202, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('process-school-doc-background error:', err)
    if (jobId) {
      await supabase.from('extraction_jobs').update({
        status: 'error',
        error_msg: err.message,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).catch(() => {})
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
