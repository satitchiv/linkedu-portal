// POST /api/parse-gdrive
// Accepts a Google Drive or Google Docs URL (publicly shared — "Anyone with the link")
// Fetches document server-side, calls Gemini 2.5 Flash to extract student info
// Returns same format as parse-report.js — does NOT save

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')
const https = require('https')
const fs = require('fs')
const path = require('path')

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

// ─── URL parsing ──────────────────────────────────────────────────────────────

function parseGDriveUrl(url) {
  // Google Docs: docs.google.com/document/d/FILE_ID/...
  let m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return { fileId: m[1], type: 'doc' }

  // Google Drive file: drive.google.com/file/d/FILE_ID/...
  m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return { fileId: m[1], type: 'drive' }

  // drive.google.com/open?id=FILE_ID
  m = url.match(/drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/)
  if (m) return { fileId: m[1], type: 'drive' }

  // drive.google.com/uc?...id=FILE_ID
  m = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/)
  if (m) return { fileId: m[1], type: 'drive' }

  return null
}

// ─── HTTP fetch with redirect following ──────────────────────────────────────

function fetchUrl(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
      }
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        req.destroy()
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href
        return fetchUrl(next, redirectsLeft - 1).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({
        body: Buffer.concat(chunks),
        contentType: res.headers['content-type'] || '',
        statusCode: res.statusCode,
      }))
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timed out — check the URL is correct and the file is publicly shared.')) })
  })
}

// ─── Gemini extraction prompt (identical to parse-report.js) ─────────────────

const EXTRACT_PROMPT = `You are extracting student data from a document (school report, certificate, achievement letter, passport, or other).

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
      "issuer": "issuing organisation, school, or competition name or null",
      "presenter": "name and title of the person who signed or presented the certificate or null",
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

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const body = JSON.parse(event.body || '{}')
    const { driveUrl, fileName, studentId } = body

    if (!driveUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: 'driveUrl is required' }) }

    const parsed = parseGDriveUrl(driveUrl.trim())
    if (!parsed) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unrecognised URL. Please paste a share link from Google Drive or Google Docs.' }) }
    }

    // ── Resolve student from auth (same logic as parse-report.js) ────────────
    let resolvedStudentId = null
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid access token' }) }
      resolvedStudentId = student.id
    } else {
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      const { data: profile } = await supabase
        .from('user_profiles').select('role, student_id').eq('id', user.id).single()
      if (profile && profile.role === 'analyst' && studentId) {
        resolvedStudentId = studentId
      } else if (profile && profile.student_id) {
        resolvedStudentId = profile.student_id
      } else {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Cannot determine student for this upload' }) }
      }
    }

    const geminiKey = getGeminiKey()
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    let geminiResult

    if (parsed.type === 'doc') {
      // ── Google Doc → export as plain text ──────────────────────────────────
      const exportUrl = `https://docs.google.com/document/d/${parsed.fileId}/export?format=txt`
      const { body: textBuf, contentType, statusCode } = await fetchUrl(exportUrl)

      if (statusCode !== 200 || contentType.includes('text/html')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not access this Google Doc. Make sure it is shared as "Anyone with the link can view".' }) }
      }

      const docText = textBuf.toString('utf8').trim()
      if (docText.length < 20) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Document appears to be empty or unreadable.' }) }
      }

      geminiResult = await model.generateContent([
        { text: EXTRACT_PROMPT + '\n\nDOCUMENT TEXT:\n' + docText.slice(0, 30000) }
      ])

    } else {
      // ── Google Drive file → download PDF ───────────────────────────────────
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${parsed.fileId}&export=download&authuser=0&confirm=1`
      const { body: fileBuf, contentType, statusCode } = await fetchUrl(downloadUrl)

      if (statusCode !== 200 || contentType.includes('text/html')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Could not access this file. Make sure it is shared as "Anyone with the link can view".' }) }
      }

      if (fileBuf.length > 5_000_000) {
        return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large (max 5MB). Please upload a smaller version.' }) }
      }

      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unsupported file type. Only PDF files and Google Docs are supported.` }) }
      }

      const base64 = fileBuf.toString('base64')
      geminiResult = await model.generateContent([
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
        { text: EXTRACT_PROMPT }
      ])
    }

    // ── Parse Gemini response ─────────────────────────────────────────────────
    const raw = geminiResult.response.text().trim()
    let extracted
    try {
      extracted = JSON.parse(raw)
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) extracted = JSON.parse(match[0])
      else throw new Error('Gemini returned non-JSON: ' + raw.slice(0, 200))
    }

    extracted.grades = extracted.grades || []
    extracted.certifications = extracted.certifications || []

    const docName = fileName && fileName.trim()
      ? fileName.trim()
      : `Google ${parsed.type === 'doc' ? 'Doc' : 'Drive'} · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, extracted, fileName: docName, fileHash: null }),
    }

  } catch (err) {
    console.error('parse-gdrive error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Server error' }) }
  }
}
