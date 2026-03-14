// Shared auth helper for Netlify functions
// Accepts either X-Admin-Secret (local dev) OR Supabase JWT with analyst/admin role

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function isAuthorizedAnalyst(event) {
  // Path 1: X-Admin-Secret (local dev fallback — never in client-side code)
  const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  if (secret && secret === process.env.ADMIN_SECRET) return true

  // Path 2: Supabase JWT with analyst or admin role
  const token = (event.headers.authorization || '').replace('Bearer ', '')
  if (!token) return false

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return false

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()

  return !!(profile && (profile.role === 'analyst' || profile.role === 'admin'))
}

module.exports = { isAuthorizedAnalyst }
