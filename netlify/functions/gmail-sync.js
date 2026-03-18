// GET /api/gmail-sync?days=30
// Analyst JWT only. Fetches recent Gmail messages and checks which are already imported.

const { google } = require('googleapis')
const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

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
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    if (!await isAuthorizedAnalyst(event)) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.' }) }
    }

    const days = parseInt((event.queryStringParameters || {}).days || '30', 10)

    // Build OAuth2 client
    const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Fetch up to 50 messages from inbox + sent (combined search)
    const query = `newer_than:${days}d`
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    })

    const messages = listRes.data.messages || []
    if (messages.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ emails: [] }) }
    }

    // Fetch full details for each message (parallel, batched)
    const emailDetails = await Promise.all(
      messages.map(m => gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'full',
      }).catch(() => null))
    )

    // Check which message IDs are already imported in Supabase
    const messageIds = messages.map(m => m.id)
    const { data: existing } = await supabase
      .from('school_communications')
      .select('gmail_message_id')
      .in('gmail_message_id', messageIds)
    const importedSet = new Set((existing || []).map(r => r.gmail_message_id))

    // Parse each message
    const emails = []
    for (const res of emailDetails) {
      if (!res) continue
      const msg = res.data
      const headers_ = (msg.payload && msg.payload.headers) || []

      const getHeader = (name) => {
        const h = headers_.find(h => h.name.toLowerCase() === name.toLowerCase())
        return h ? h.value : ''
      }

      const id      = msg.id
      const from    = getHeader('From')
      const to      = getHeader('To')
      const subject = getHeader('Subject')
      const dateRaw = getHeader('Date')
      const date    = dateRaw ? new Date(dateRaw).toISOString() : null
      const snippet = msg.snippet || ''

      // Extract plain text body
      const bodyText = extractPlainText(msg.payload)

      // Detect direction
      const fromLower = from.toLowerCase()
      const toLower   = to.toLowerCase()
      const isOutbound = fromLower.includes('linkedu.hk') || fromLower.includes('satit@')
      const direction  = isOutbound ? 'outbound' : 'inbound'

      emails.push({
        id,
        from,
        to,
        subject,
        date,
        snippet,
        body_text: bodyText,
        direction,
        already_imported: importedSet.has(id),
      })
    }

    // Sort by date DESC
    emails.sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date) - new Date(a.date)
    })

    return { statusCode: 200, headers, body: JSON.stringify({ emails }) }

  } catch (err) {
    console.error('gmail-sync error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}

// Recursively extract plain text from MIME parts
function extractPlainText(payload) {
  if (!payload) return ''

  // Direct plain text body
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  }

  // Multipart: recurse into parts
  if (payload.parts && payload.parts.length) {
    // Prefer text/plain over text/html
    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plainPart) return extractPlainText(plainPart)

    // Fall back: recurse all parts
    for (const part of payload.parts) {
      const text = extractPlainText(part)
      if (text) return text
    }
  }

  return ''
}
