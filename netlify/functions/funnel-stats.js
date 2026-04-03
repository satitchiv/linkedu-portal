// GET /api/funnel-stats
// Returns funnel conversion counts and top sources/referrers for the Free Accounts dashboard.
// Auth: X-Admin-Secret OR analyst JWT
// Query param: ?days=30 (default 30)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
}

// Normalize a raw referrer URL into a readable label.
// utm_source takes priority when provided.
function normalizeReferrer(rawReferrer, utmSource) {
  if (utmSource) {
    const s = utmSource.toLowerCase()
    if (s.includes('line'))      return 'LINE'
    if (s.includes('instagram')) return 'Instagram'
    if (s.includes('facebook'))  return 'Facebook'
    if (s.includes('google'))    return 'Google'
    // Return capitalized utm_source as-is for anything else
    return utmSource.charAt(0).toUpperCase() + utmSource.slice(1)
  }
  if (!rawReferrer) return 'Direct'
  try {
    const hostname = new URL(rawReferrer).hostname.replace(/^www\./, '')
    if (hostname.includes('line.me'))        return 'LINE'
    if (hostname.includes('google.'))        return 'Google'
    if (hostname.includes('instagram.com'))  return 'Instagram'
    if (hostname.includes('facebook.com'))   return 'Facebook'
    if (hostname.includes('t.co') || hostname.includes('twitter.com')) return 'X / Twitter'
    return hostname
  } catch {
    return 'Direct'
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // Auth: admin secret or analyst JWT
  const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  const isAdmin = secret && secret === process.env.ADMIN_SECRET
  if (!isAdmin) {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'analyst') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
  }

  const days = parseInt(event.queryStringParameters?.days || '30', 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Fetch all funnel_events in window
    const { data: events, error } = await supabase
      .from('funnel_events')
      .select('user_id, event_name, properties, created_at')
      .gte('created_at', since)

    if (error) throw error

    // Count distinct users per event
    const usersByEvent = {}
    for (const e of events) {
      if (!usersByEvent[e.event_name]) usersByEvent[e.event_name] = new Set()
      usersByEvent[e.event_name].add(e.user_id)
    }

    const signups         = (usersByEvent['signup_completed']      || new Set()).size
    const toolSaves       = (usersByEvent['tool_save_completed']   || new Set()).size
    const portalVisits    = (usersByEvent['portal_visited']        || new Set()).size
    const consultations   = (usersByEvent['consultation_requested']|| new Set()).size

    // Top signup sources
    const sourceCounts = {}
    for (const e of events) {
      if (e.event_name !== 'signup_completed') continue
      const src = e.properties?.source || '(unknown)'
      sourceCounts[src] = (sourceCounts[src] || 0) + 1
    }
    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([source, count]) => ({ source, count }))

    // Top referrers (normalized)
    const referrerCounts = {}
    for (const e of events) {
      if (e.event_name !== 'signup_completed') continue
      const label = normalizeReferrer(e.properties?.referrer, e.properties?.utm_source)
      referrerCounts[label] = (referrerCounts[label] || 0) + 1
    }
    const topReferrers = Object.entries(referrerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([referrer, count]) => ({ referrer, count }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        days,
        signups,
        tool_saves: toolSaves,
        portal_visits: portalVisits,
        consultations,
        top_sources: topSources,
        top_referrers: topReferrers,
      }),
    }
  } catch (err) {
    console.error('funnel-stats error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) }
  }
}
