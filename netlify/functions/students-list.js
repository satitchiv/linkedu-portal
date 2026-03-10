// GET /api/students-list
// Returns all students from Notion — analysts only
// Used by analyst golf entry app to populate student dropdown

const { Client } = require('@notionhq/client')
const { createClient } = require('@supabase/supabase-js')

const notion = new Client({ auth: process.env.NOTION_KEY })
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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Analysts only
    if (!profile || profile.role !== 'analyst') {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Analysts only' }) }
    }

    const res = await notion.databases.query({
      database_id: process.env.NOTION_DB_STUDENTS,
      sorts: [{ property: 'Student Name', direction: 'ascending' }]
    })

    const students = res.results.map(r => {
      const p = r.properties
      const name = p['Student Name']?.title?.map(t => t.plain_text).join('') || 'Unknown'
      return { id: r.id, name }
    })

    return { statusCode: 200, headers, body: JSON.stringify({ students }) }

  } catch (err) {
    console.error('students-list error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
