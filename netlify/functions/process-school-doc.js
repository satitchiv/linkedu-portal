// POST /api/process-school-doc
// Analyst-only. Accepts a base64-encoded PDF + school name + doc type hint.
// Calls Gemini 2.5 Flash to extract structured data.
// Returns extracted JSON for analyst review — does NOT write to DB.

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { isAuthorizedAnalyst } = require('./utils/auth')
const fs   = require('fs')
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

  try {
    if (!(await isAuthorizedAnalyst(event))) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const body = JSON.parse(event.body || '{}')
    const { pdfBase64, fileName, schoolName, docTypeHint } = body

    if (!pdfBase64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'pdfBase64 is required' }) }
    }
    if (!schoolName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'schoolName is required' }) }
    }
    if (pdfBase64.length > 4_000_000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'File too large. Keep documents under 3MB.' }) }
    }

    const geminiKey = getGeminiKey()
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    const hint = docTypeHint || 'unknown'

    const prompt = `You are extracting structured data from a UK boarding school administrative document.

The analyst has indicated this may be a: ${hint}.
School name context: ${schoolName}.

First, identify the actual document type:
- "term_calendar" — contains term start/end dates, half-term, exeat dates, key school events
- "visa_guide" — contains visa route, requirements, document checklist, key dates
- "uniform_list" — contains items students must bring, categorised by type
- "insurance_contacts" — contains emergency contacts, insurance policy numbers, procedures
- "boarding_checklist" — contains arrival checklist, what to bring to boarding
- "equipment_list" — sports equipment, laptop specs, or other equipment requirements
- "cashless_payment" — school payment systems, prepaid cards, allowance info
- "general" — any other school document

Return ONLY valid JSON — no markdown, no explanation, no code blocks.

{
  "docType": "term_calendar|visa_guide|uniform_list|insurance_contacts|boarding_checklist|equipment_list|cashless_payment|general",
  "schoolName": "school name found in document or null",
  "academicYear": "e.g. 2025-26 or null",

  "termDates": [
    {
      "term": "term name e.g. Michaelmas 2025",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "halfTermStart": "YYYY-MM-DD or null",
      "halfTermEnd": "YYYY-MM-DD or null",
      "exeatDates": ["YYYY-MM-DD"],
      "keyEvents": [
        { "title": "event name", "date": "YYYY-MM-DD or null", "time": "e.g. 8:10am or null", "notes": "any detail or null" }
      ]
    }
  ],

  "visaInfo": {
    "visaType": "e.g. Child Student Visa or null",
    "route": "e.g. Student route or null",
    "keyRequirements": ["requirement 1", "requirement 2"],
    "documentChecklist": ["document 1", "document 2"],
    "keyDates": [{ "label": "e.g. Application window opens", "date": "YYYY-MM-DD or null", "notes": "or null" }],
    "notes": "any additional visa information or null"
  },

  "uniformInfo": {
    "categories": [
      { "category": "e.g. Boys Summer Uniform", "items": [{ "item": "item name", "quantity": "or null", "notes": "e.g. From school shop or null" }] }
    ],
    "generalNotes": "any general notes or null"
  },

  "contacts": {
    "emergencyContacts": [{ "name": "contact name or role", "phone": "or null", "email": "or null", "role": "or null" }],
    "insuranceProvider": "provider name or null",
    "policyNumber": "policy number or null",
    "coverageNotes": "what the policy covers or null",
    "procedures": ["procedure step 1"],
    "additionalContacts": [{ "name": "or null", "phone": "or null", "email": "or null", "notes": "or null" }]
  },

  "boardingChecklist": {
    "sections": [
      { "section": "section heading e.g. Clothing", "items": [{ "item": "item name", "quantity": "or null", "notes": "or null" }] }
    ],
    "generalNotes": "or null"
  },

  "equipmentList": {
    "sections": [
      { "section": "section heading e.g. Sports Equipment", "items": [{ "item": "item name", "spec": "e.g. 13-inch MacBook Air or null", "notes": "or null" }] }
    ],
    "generalNotes": "or null"
  },

  "cashlessPayment": {
    "system": "name of payment system e.g. WisePay or null",
    "description": "how the system works or null",
    "topUpMethods": ["method 1", "method 2"],
    "recommendedAmount": "e.g. £100 per term or null",
    "notes": "any additional info or null"
  },

  "generalNotes": "For general/unknown documents: a concise structured summary of all key facts, dates, requirements, and important information. Null for other doc types."
}

Rules:
- Fill ONLY the field matching the detected docType. Set all other typed fields to null.
- termDates: extract EVERY term, EVERY exeat, EVERY key event in the document. Miss nothing.
- Dates must be YYYY-MM-DD. Infer year from academicYear context. If uncertain, use null — never guess.
- If the document contains multiple types of information, choose the PRIMARY type and put everything else in generalNotes.
- generalNotes is used ONLY when docType is "general" — leave null for all other types.
- If docType cannot be determined, use "general" and summarise everything in generalNotes.`

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, extracted, fileName: fileName || 'document.pdf' })
    }

  } catch (err) {
    console.error('process-school-doc error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
