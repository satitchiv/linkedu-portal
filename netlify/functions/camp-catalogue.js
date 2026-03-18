// GET /api/camp-catalogue
// Returns all camp names + basic info from Notion for manual search/add
// Analyst only

const { Client } = require('@notionhq/client')
const { isAuthorizedAnalyst } = require('./utils/auth')

const notion = new Client({ auth: process.env.NOTION_KEY })
const NOTION_DB_ID = '3199d89c-abdc-81cd-96e9-eace5ee01834'

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const camps = []
    let cursor = undefined
    do {
      const response = await notion.databases.query({
        database_id: NOTION_DB_ID,
        start_cursor: cursor,
        page_size: 100,
      })
      for (const page of response.results) {
        const p = page.properties
        const get = (key, type) => {
          const prop = p[key]
          if (!prop) return null
          if (type === 'title') return prop.title?.map(t => t.plain_text).join('') || null
          if (type === 'text') return prop.rich_text?.map(t => t.plain_text).join('') || null
          if (type === 'select') return prop.select?.name || null
          if (type === 'url') return prop.url || null
          return null
        }
        const name = get('Title', 'title')
        if (!name) continue
        camps.push({
          pageUrl:        page.url,
          name,
          programmeType:  get('Type of Programme', 'select'),
          cityLocation:   get('City Location', 'text'),
          eligibleAges:   get('Eligible Ages', 'text') || get('Age of Participants', 'text'),
          residentialGBP: get('Residential (GBP)', 'text'),
          period:         get('Period', 'text'),
          brochureUrl:    get('Brochure', 'url') || get('Summer Camp Link', 'url') || get('Website', 'url'),
        })
      }
      cursor = response.has_more ? response.next_cursor : undefined
    } while (cursor)

    camps.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, camps }) }
  } catch (err) {
    console.error('camp-catalogue error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
