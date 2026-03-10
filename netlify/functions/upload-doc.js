// POST /api/upload-doc
// Parent submits a document link — saves to Supabase + creates Notion record

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

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    const body = JSON.parse(event.body || '{}')
    const { doc_title, doc_link, doc_notes, doc_type } = body

    if (!doc_title) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'doc_title is required' }) }
    }

    // Save to Supabase
    const { error: sbError } = await supabase
      .from('document_submissions')
      .insert({
        notion_student_id: profile.notion_student_id,
        doc_title,
        doc_link,
        doc_notes,
        doc_type,
        submitted_by: user.id,
        status: 'submitted',
      })

    if (sbError) throw sbError

    // Also create record in Notion documents DB
    try {
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_DB_DOCUMENTS },
        properties: {
          'Document Title': { title: [{ text: { content: doc_title } }] },
          'Status':         { select: { name: 'Uploaded' } },
          'File Link':      doc_link ? { url: doc_link } : undefined,
          'Notes':          doc_notes ? { rich_text: [{ text: { content: doc_notes } }] } : undefined,
          'Student':        { relation: [{ id: profile.notion_student_id }] },
        }
      })
    } catch (notionErr) {
      // Notion write failed but Supabase succeeded — log and continue
      console.warn('Notion doc create failed (non-fatal):', notionErr.message)
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }

  } catch (err) {
    console.error('upload-doc error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
