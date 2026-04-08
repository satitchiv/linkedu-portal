// GET /api/get-school-reports
// Returns full school detail for a student's recommendations, merged with Notion enrichment data.
// Auth: X-Access-Token (token link) or Authorization: Bearer <jwt>
// Used by the School Reports tab in the parent portal.

const https = require('https')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const NOTION_DB_ID = '30e9d89c-abdc-8002-a053-f16764e9d51d'

// ── Notion helpers ─────────────────────────────────────────────────────────────
function notionRequest(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request({
      hostname: 'api.notion.com',
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    }, (res) => {
      let buf = ''
      res.on('data', chunk => buf += chunk)
      res.on('end', () => { try { resolve(JSON.parse(buf)) } catch(e) { reject(e) } })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function extractText(prop) {
  if (!prop) return null
  if (prop.type === 'title')     return prop.title?.[0]?.plain_text || null
  if (prop.type === 'rich_text') return prop.rich_text?.[0]?.plain_text || null
  if (prop.type === 'select')    return prop.select?.name || null
  if (prop.type === 'number')    return prop.number ?? null
  return null
}

function parseNotionSchool(page) {
  const p = page.properties
  return {
    notion_name:             extractText(p['School Name']),
    location:                extractText(p['Location']),
    thai_angle_en:           extractText(p['Thai Angle EN']),
    hero_tagline_en:         extractText(p['Hero Tagline EN']),
    parent_quote_en:         extractText(p['Parent Quote EN']),
    parent_attribution_en:   extractText(p['Parent Attribution EN']),
    gcse_results:            extractText(p['GCSE\n(9 - 7)']),
    alevel_results:          extractText(p['A-Level\n(A* - A)']),
    a_level_subjects:        extractText(p['A Level Subjects']),
    russell_group:           extractText(p['Russell Group Destination']),
    oxbridge:                extractText(p['Oxbridge Destination']),
    core_sports:             extractText(p['Core Sports']),
    competition_achievements: extractText(p['Competition Achievements']),
    isi_key_strengths:       extractText(p['ISI Key Strengths']),
    scholarships:            extractText(p['Update Scholarships']),
    pastoral_care:           extractText(p['Pastoral Care']),
    school_character_notion: extractText(p['School Character']),
    notable_alumni:          extractText(p['Notable Alumni']),
    location_description:    extractText(p['Location Description']),
    founded_year:            extractText(p['Founded Year']),
    fees_per_year:           extractText(p['Boarding Fee\n Year 7 - Year 13\n Per Year']),
    fees_per_term:           extractText(p['Boarding Fee\n Year 7 - Year 13\n Per Term']),
    fees_thb:                extractText(p['Fees in THB (Per Annum)']),
    visa_route:              extractText(p['Visa Route']),
    saturday_school:         extractText(p['Saturday School']),
    // Tennis programme data (2024/25 season)
    tennis_teams:            p['Tennis Teams (2024/25)']?.number ?? null,
    tennis_total_fixtures:   p['Tennis Total Fixtures']?.number ?? null,
    tennis_age_groups:       extractText(p['Tennis Age Groups']),
    tennis_u18_fixtures:     p['Tennis U18 Fixtures']?.number ?? null,
    tennis_u16_fixtures:     p['Tennis U16 Fixtures']?.number ?? null,
    tennis_u15_fixtures:     p['Tennis U15 Fixtures']?.number ?? null,
    tennis_u14_fixtures:     p['Tennis U14 Fixtures']?.number ?? null,
    tennis_u13_fixtures:     p['Tennis U13 Fixtures']?.number ?? null,
    tennis_u12_fixtures:     p['Tennis U12 Fixtures']?.number ?? null,
    tennis_1st_record:       extractText(p['Tennis 1st Record']),
    tennis_national:         p['Tennis National']?.select?.name ?? null,
    tennis_lta:              extractText(p['Tennis LTA']),
    tennis_coach:            extractText(p['Tennis Coach']),
    tennis_competitions:     extractText(p['Tennis Competitions']),
    // History + CS (new)
    tennis_historical_fixtures: extractText(p['Tennis Historical Fixtures']),
    tennis_4yr_avg_fixtures:    p['Tennis 4yr Avg Fixtures']?.number ?? null,
    cs_gcse:                    p['CS at GCSE']?.select?.name ?? null,
    cs_alevel:                  p['CS at A-Level']?.select?.name ?? null,
    coding_programme:           extractText(p['Coding Programme']),
  }
}

// Fetch all UK schools from Notion (paginated)
async function fetchAllNotionSchools() {
  const schools = []
  let cursor = undefined
  while (true) {
    const body = {
      filter: { property: 'Country', select: { equals: 'United Kingdom' } },
      page_size: 100,
    }
    if (cursor) body.start_cursor = cursor
    const result = await notionRequest(`/v1/databases/${NOTION_DB_ID}/query`, body)
    if (result.object === 'error') throw new Error(`Notion error: ${result.message}`)
    for (const page of (result.results || [])) {
      schools.push(parseNotionSchool(page))
    }
    if (!result.has_more) break
    cursor = result.next_cursor
  }
  return schools
}

// Normalise school name for matching (lowercase, strip punctuation)
function normalise(name) {
  if (!name) return ''
  return name.toLowerCase().replace(/[''']/g, "'").replace(/[^a-z0-9 ']/g, '').trim()
}

// ── Handler ────────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    if (!process.env.NOTION_API_KEY) {
      return { statusCode: 503, headers, body: JSON.stringify({ error: 'NOTION_API_KEY not configured' }) }
    }

    let studentId = null

    // ── Auth path 1: X-Access-Token (token link) ───────────────────────────────
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired link' }) }
      studentId = student.id
    } else {
      // ── Auth path 2: Supabase JWT ────────────────────────────────────────────
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }
      const { data: profile } = await supabase
        .from('user_profiles').select('student_id, role').eq('id', user.id).single()
      if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }
      // Analysts may request a specific student via ?student_id= query param
      const qsStudentId = event.queryStringParameters?.student_id
      if (qsStudentId && (profile.role === 'analyst' || profile.role === 'admin')) {
        studentId = qsStudentId
      } else {
        studentId = profile.student_id
      }
    }

    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No student linked to this session' }) }

    // ── Fetch in parallel: recommendations + Notion schools ───────────────────
    const [recsResult, notionSchools] = await Promise.all([
      supabase
        .from('student_recommendations')
        .select('*')
        .eq('student_id', studentId)
        .eq('approved', true)
        .order('score', { ascending: false }),
      fetchAllNotionSchools(),
    ])

    const recs = recsResult.data || []

    // Build a normalised name → notion data map
    const notionMap = {}
    for (const ns of notionSchools) {
      if (ns.notion_name) {
        notionMap[normalise(ns.notion_name)] = ns
      }
    }

    // Merge each rec with its Notion data
    const results = recs.map((rec, index) => {
      const notionData = notionMap[normalise(rec.school_name)] || {}
      return {
        rec_id:                  rec.id,
        rank:                    index + 1,
        school_name:             rec.school_name,
        score:                   rec.score,
        tier:                    rec.tier,
        fee:                     rec.fee,
        region:                  rec.region,
        school_type:             rec.school_type,
        match_reasons:           rec.match_reasons || [],
        consultant_note:         rec.consultant_note || null,
        analyst_notes:           rec.analyst_notes || null,
        // Notion enrichment
        location:                notionData.location         || null,
        thai_angle_en:           notionData.thai_angle_en    || null,
        hero_tagline_en:         notionData.hero_tagline_en  || null,
        parent_quote_en:         notionData.parent_quote_en  || null,
        parent_attribution_en:   notionData.parent_attribution_en || null,
        gcse_results:            notionData.gcse_results     || null,
        alevel_results:          notionData.alevel_results   || null,
        a_level_subjects:        notionData.a_level_subjects || null,
        russell_group:           notionData.russell_group    || null,
        oxbridge:                notionData.oxbridge         || null,
        core_sports:             notionData.core_sports      || null,
        competition_achievements: notionData.competition_achievements || null,
        isi_key_strengths:       notionData.isi_key_strengths || null,
        scholarships:            notionData.scholarships     || null,
        pastoral_care:           notionData.pastoral_care    || null,
        school_character_notion: notionData.school_character_notion || null,
        notable_alumni:          notionData.notable_alumni   || null,
        location_description:    notionData.location_description || null,
        founded_year:            notionData.founded_year     || null,
        fees_per_year:           notionData.fees_per_year    || null,
        fees_per_term:           notionData.fees_per_term    || null,
        fees_thb:                notionData.fees_thb         || null,
        visa_route:              notionData.visa_route       || null,
        saturday_school:         notionData.saturday_school  || null,
        // Tennis programme
        tennis_teams:            notionData.tennis_teams            ?? null,
        tennis_total_fixtures:   notionData.tennis_total_fixtures   ?? null,
        tennis_age_groups:       notionData.tennis_age_groups       || null,
        tennis_u18_fixtures:     notionData.tennis_u18_fixtures     ?? null,
        tennis_u16_fixtures:     notionData.tennis_u16_fixtures     ?? null,
        tennis_u15_fixtures:     notionData.tennis_u15_fixtures     ?? null,
        tennis_u14_fixtures:     notionData.tennis_u14_fixtures     ?? null,
        tennis_u13_fixtures:     notionData.tennis_u13_fixtures     ?? null,
        tennis_u12_fixtures:     notionData.tennis_u12_fixtures     ?? null,
        tennis_1st_record:       notionData.tennis_1st_record       || null,
        tennis_national:         notionData.tennis_national         || null,
        tennis_lta:              notionData.tennis_lta              || null,
        tennis_coach:            notionData.tennis_coach            || null,
        tennis_competitions:     notionData.tennis_competitions     || null,
        tennis_historical_fixtures: notionData.tennis_historical_fixtures || null,
        tennis_4yr_avg_fixtures:    notionData.tennis_4yr_avg_fixtures    ?? null,
        cs_gcse:                    notionData.cs_gcse                    || null,
        cs_alevel:                  notionData.cs_alevel                  || null,
        coding_programme:           notionData.coding_programme           || null,
      }
    })

    return { statusCode: 200, headers, body: JSON.stringify(results) }

  } catch (err) {
    console.error('get-school-reports error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
