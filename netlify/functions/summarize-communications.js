// POST /api/summarize-communications
// Analyst JWT only. Collects emails for a school, sends to Gemini, returns briefing.

const { GoogleGenerativeAI } = require('@google/generative-ai')
const { isAuthorizedAnalyst } = require('./utils/auth')
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
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const { school_name, emails } = JSON.parse(event.body || '{}')

    if (!school_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'school_name required' }) }
    }
    if (!emails || emails.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No emails to summarise' }) }
    }

    // Sort chronologically: oldest first, newest last
    const sorted = [...emails].sort((a, b) => {
      const da = a.sent_at ? new Date(a.sent_at) : null
      const db = b.sent_at ? new Date(b.sent_at) : null
      if (!da && !db) return 0
      if (!da) return 1   // undated goes to end (treat as unknown, not ancient)
      if (!db) return -1
      return da - db
    })

    const emailsText = sorted.map((e, i) => {
      const date = e.sent_at ? new Date(e.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown date'
      const dir = e.direction === 'outbound' ? 'Outbound (LinkedU → School)' : 'Inbound (School → LinkedU)'
      const label = i === sorted.length - 1 ? ' [MOST RECENT]' : ''
      return `${date}${label} | ${dir} | ${e.subject || '(no subject)'}\n${e.body_text || '(no body)'}\n---`
    }).join('\n')

    const prompt = `You are a consultant assistant for LINKEDU, a Bangkok boarding school consulting firm.

Below are all logged email communications between the LINKEDU consultant and ${school_name}, on behalf of one Thai student. Emails are in chronological order — oldest first, newest last. The last email is the most recent and should anchor the "Current status" section.

Write a concise briefing note (max 200 words) with these three sections:

**Current status** — where things stand right now, based on the most recent emails
**Confirmed / agreed** — anything explicitly confirmed, accepted, or decided across the thread
**Next steps** — specific actions pending, with any deadlines if mentioned. Format each next step as a bullet point starting with "- ". If there are no next steps, write "- None identified."

Be factual and specific. Use dates where relevant. Professional English, no filler.

--- EMAILS (oldest → newest) ---
${emailsText}`

    const genAI = new GoogleGenerativeAI(getGeminiKey())
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const summary = result.response.text().trim()

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const subject = `AI Summary — ${school_name} · ${today}`

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ summary, subject }),
    }

  } catch (err) {
    console.error('summarize-communications error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
