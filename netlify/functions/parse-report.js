// POST /api/parse-report
// Accepts a base64-encoded PDF (any document type)
// Calls Gemini 2.5 Flash to extract student info, grades, and certifications
// Returns extracted JSON for parent review — does NOT save yet

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read GEMINI_API_KEY directly from .env for local dev reliability
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

    const body = JSON.parse(event.body || '{}')
    const { pdfBase64, fileName, fileHash, studentId } = body

    if (!pdfBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'pdfBase64 is required' }) }
    }
    if (pdfBase64.length > 4_000_000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large. Please keep documents under 3MB.' }) }
    }

    // ── Duplicate check — scoped to the specific student being uploaded to ────
    if (fileHash && studentId) {
      const { data: existing } = await supabase
        .from('document_extractions')
        .select('doc_name, extracted_at')
        .eq('student_id', studentId)
        .eq('file_hash', fileHash)
        .limit(1)
        .single()
      if (existing) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'duplicate',
            message: `This document was already uploaded as "${existing.doc_name}" on ${new Date(existing.extracted_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}.`,
            docName: existing.doc_name,
            extractedAt: existing.extracted_at,
          })
        }
      }
    }

    const geminiKey = getGeminiKey()
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const prompt = `You are extracting student data from a document (school report, certificate, achievement letter, passport, or other).

First identify the document type, then extract ALL relevant information.

Return ONLY a valid JSON object — no markdown, no explanation, no code blocks. Just raw JSON.

Use this exact structure:
{
  "docType": "school_report|english_cert|standardised_test|achievement|passport|reference|other",
  "studentName": "full name or null",
  "dob": "YYYY-MM-DD or null",
  "school": "school/institution name or null",
  "yearGroup": "e.g. Year 8, Grade 8, or null",
  "curriculum": "IGCSE, IB, A-Level, Thai, or null",
  "term": "e.g. Term 1, Semester 2, or null",
  "academicYear": "e.g. 2024-25, 2024 or null",
  "grades": [
    {
      "subject": "subject name",
      "grade": "letter grade e.g. A, B+, 7, Merit or null",
      "score": numeric score or null,
      "maxScore": max possible score or null
    }
  ],
  "certifications": [
    {
      "category": "english_test|standardised_test|sport|academic_award|extracurricular|other",
      "name": "e.g. IELTS Academic, Duke of Edinburgh Gold, Regional Golf Champion",
      "issuer": "issuing organisation, school, or competition name e.g. British Council, Regional Golf Association, or null",
      "presenter": "name and title of the person who signed or presented the certificate e.g. Mr. John Smith, Headmaster or null",
      "score": "score/result as string e.g. 7.5, 1280, Gold or null",
      "grade": "grade/band if different from score or null",
      "date": "YYYY-MM-DD or null",
      "expiryDate": "YYYY-MM-DD or null",
      "notes": "any extra relevant info or null"
    }
  ]
}

Rules:
- For school reports: fill grades array with ALL subjects listed
- For English tests (IELTS/TOEFL/Cambridge): put result in certifications with category "english_test", set expiryDate 2 years after test date
- For sports trophies/medals/rankings: category "sport"
- For academic prizes/competitions: category "academic_award"
- For Duke of Edinburgh, Model UN, music grades: category "extracurricular"
- For passports: extract studentName, dob, nationality in the profile fields only — no certifications needed
- Extract ALL achievements/certificates found in the document
- If a field cannot be confidently extracted, use null
- grades array should be empty [] if no academic grades found
- certifications array should be empty [] if no certificates/achievements found`

    const result = await model.generateContent([
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      { text: prompt }
    ])

    const raw = result.response.text().trim()

    let extracted
    try {
      extracted = JSON.parse(raw)
    } catch (parseErr) {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        extracted = JSON.parse(match[0])
      } else {
        throw new Error('Gemini returned non-JSON: ' + raw.slice(0, 200))
      }
    }

    // Ensure arrays exist
    extracted.grades = extracted.grades || []
    extracted.certifications = extracted.certifications || []

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, extracted, fileName: fileName || 'document.pdf', fileHash: fileHash || null })
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
