// GET /api/student
// Returns full student data from Notion for the authenticated parent
// Requires: Supabase JWT in Authorization header

const { Client } = require('@notionhq/client')
const { createClient } = require('@supabase/supabase-js')

const notion = new Client({ auth: process.env.NOTION_KEY })
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DB = {
  students:      process.env.NOTION_DB_STUDENTS,
  academics:     process.env.NOTION_DB_ACADEMICS,
  subscriptions: process.env.NOTION_DB_SUBSCRIPTIONS,
  milestones:    process.env.NOTION_DB_MILESTONES,
  documents:     process.env.NOTION_DB_DOCUMENTS,
}

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
    // Verify Supabase JWT
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    // Get user profile (notion_student_id + role)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    const studentId = profile.notion_student_id

    // Fetch all Notion data in parallel
    const [studentRes, academicsRes, subscriptionsRes, milestonesRes, documentsRes] = await Promise.all([
      notion.pages.retrieve({ page_id: studentId }),
      notion.databases.query({
        database_id: DB.academics,
        filter: { property: 'Student', relation: { contains: studentId } }
      }),
      notion.databases.query({
        database_id: DB.subscriptions,
        filter: { property: 'Student', relation: { contains: studentId } }
      }),
      notion.databases.query({
        database_id: DB.milestones,
        filter: { property: 'Student', relation: { contains: studentId } },
        sorts: [{ property: 'Date', direction: 'ascending' }]
      }),
      notion.databases.query({
        database_id: DB.documents,
        filter: { property: 'Student', relation: { contains: studentId } }
      }),
    ])

    // Parse student properties
    const sp = studentRes.properties
    const student = {
      id: studentId,
      studentName:       getText(sp['Student Name']),
      parentName:        getText(sp['Parent Name']),
      currentSchool:     getText(sp['Current School']),
      currentYearGroup:  getText(sp['Current Year Group']),
      dob:               getDate(sp['Date of Birth']),
      nationality:       getSelect(sp['Nationality']),
      englishLevel:      getSelect(sp['English Level']),
      primarySport:      getSelect(sp['Primary Sport']),
      goal:              getText(sp['Goal']),
      destination:       getMultiSelect(sp['Destination']),
      consultant:        getText(sp['Assigned Consultant']),
      budgetGBP:         getNumber(sp['Annual Budget GBP']),
      status:            getSelect(sp['Status']),
      stage:             getSelect(sp['Stage']),
      targetEntryYear:   getText(sp['Target Entry Year']),
      targetYearGroup:   getText(sp['Target Entry Year Group']),
      consultantMessage: getText(sp['Consultant Message']),
      servicesActive:    getMultiSelect(sp['Services Active']),
    }

    // Parse academics
    const academics = academicsRes.results.map(r => {
      const p = r.properties
      return {
        subject:        getText(p['Subject']),
        grade:          getSelect(p['Grade']),
        assessmentType: getSelect(p['Assessment Type']),
        term:           getText(p['Term']),
        date:           getDate(p['Date']),
        score:          getNumber(p['Score']),
        maxScore:       getNumber(p['Max Score']),
      }
    })

    // Parse subscriptions
    const subscriptions = subscriptionsRes.results.map(r => {
      const p = r.properties
      return {
        service: getText(p['Service Type']),
        active:  getCheckbox(p['Active']),
      }
    })

    // Parse milestones
    const milestones = milestonesRes.results.map(r => {
      const p = r.properties
      return {
        id:       r.id,
        title:    getText(p['Milestone Title']),
        type:     getSelect(p['Type']),
        date:     getDate(p['Date']),
        status:   getSelect(p['Status']),
        notes:    getText(p['Notes']),
        priority: getSelect(p['Priority']),
      }
    })

    // Parse documents
    const documents = documentsRes.results.map(r => {
      const p = r.properties
      return {
        id:       r.id,
        title:    getText(p['Document Title']),
        status:   getSelect(p['Status']),
        type:     getSelect(p['Document Type']),
        fileLink: getUrl(p['File Link']),
        notes:    getText(p['Notes']),
        dueDate:  getDate(p['Required By']),
      }
    })

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        student,
        academics,
        subscriptions,
        milestones,
        documents,
        role: profile.role,
      })
    }

  } catch (err) {
    console.error('student function error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}

// Notion property parsers
function getText(p) {
  if (!p) return ''
  if (p.type === 'title') return p.title.map(t => t.plain_text).join('')
  if (p.type === 'rich_text') return p.rich_text.map(t => t.plain_text).join('')
  return ''
}
function getSelect(p) {
  return p?.select?.name || ''
}
function getMultiSelect(p) {
  return p?.multi_select?.map(s => s.name) || []
}
function getNumber(p) {
  return p?.number ?? null
}
function getDate(p) {
  return p?.date?.start || null
}
function getCheckbox(p) {
  return p?.checkbox ?? false
}
function getUrl(p) {
  return p?.url || null
}
