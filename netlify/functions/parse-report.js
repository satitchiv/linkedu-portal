// POST /api/parse-report
// Accepts a base64-encoded PDF school report
// Calls Gemini 2.5 Flash to extract student info + academic grades
// Returns extracted JSON for parent review — does NOT save yet

const { GoogleGenerativeAI } = require('@google/generative-ai')
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
    // Auth
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    // Parse body
    const body = JSON.parse(event.body || '{}')
    const { pdfBase64, fileName } = body

    if (!pdfBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'pdfBase64 is required' }) }
    }

    if (pdfBase64.length > 4_000_000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large. Please keep reports under 3MB.' }) }
    }

    // Call Gemini 2.5 Flash
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `You are extracting student data from a school report card PDF.

Return ONLY a valid JSON object — no markdown, no explanation, no code blocks. Just raw JSON.

The JSON must have this exact structure:
{
  "studentName": "full name from report or null",
  "dob": "YYYY-MM-DD if found or null",
  "school": "school name or null",
  "yearGroup": "e.g. Year 8, Grade 8, or null",
  "curriculum": "IGCSE, IB, A-Level, Thai, or null",
  "term": "e.g. Term 1, Semester 2, or null",
  "academicYear": "e.g. 2024-25, 2024 or null",
  "grades": [
    {
      "subject": "subject name",
      "grade": "letter grade e.g. A, B+, 7, Merit or null",
      "score": numeric percentage or raw score or null,
      "maxScore": max possible score or null
    }
  ]
}

If you cannot confidently extract a field, use null. Extract ALL subjects listed in the report.`

    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      { text: prompt }
    ])

    const raw = result.response.text().trim()

    let extracted
    try {
      extracted = JSON.parse(raw)
    } catch (parseErr) {
      // Gemini sometimes wraps in ```json ... ``` — strip it
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        extracted = JSON.parse(match[0])
      } else {
        throw new Error('Gemini returned non-JSON: ' + raw.slice(0, 200))
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, extracted, fileName: fileName || 'report.pdf' })
    }

  } catch (err) {
    console.error('parse-report error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
