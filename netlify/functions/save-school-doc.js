// GET  /api/save-school-doc?school_name=X
//   Returns students linked to this school (exact match first, ILIKE fallback).
//   Used for the "visible to" preview before saving.
//
// POST /api/save-school-doc
//   Saves confirmed extracted JSON to school_info.documents (JSONB dict keyed by docType).
//   Merge strategy: new docType key is written; all other keys are preserved.
//
// Analyst-only — requires X-Admin-Secret or Supabase JWT with analyst role.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Map docType → the key stored inside school_info.documents
// Allows the UI hint and the storage key to differ if needed.
const DOC_TYPE_KEYS = {
  term_calendar:        'term_calendar',
  visa_guide:           'visa_guide',
  uniform_list:         'uniform_list',
  insurance_contacts:   'insurance_contacts',
  boarding_checklist:   'boarding_checklist',
  equipment_list:       'equipment_list',
  cashless_payment:     'cashless_payment',
  general:              'general',
}

// Build the payload that goes inside documents[docType]
function buildDocPayload(docType, extracted) {
  const year = extracted.academicYear || null
  switch (docType) {
    case 'term_calendar':
      return { academicYear: year, terms: extracted.termDates || [], savedAt: new Date().toISOString() }
    case 'visa_guide':
      return { ...(extracted.visaInfo || {}), academicYear: year, savedAt: new Date().toISOString() }
    case 'uniform_list':
      return { ...(extracted.uniformInfo || {}), academicYear: year, savedAt: new Date().toISOString() }
    case 'insurance_contacts':
      return { ...(extracted.contacts || {}), savedAt: new Date().toISOString() }
    case 'boarding_checklist':
      return { ...(extracted.boardingChecklist || {}), academicYear: year, savedAt: new Date().toISOString() }
    case 'equipment_list':
      return { ...(extracted.equipmentList || {}), academicYear: year, savedAt: new Date().toISOString() }
    case 'cashless_payment':
      return { ...(extracted.cashlessPayment || {}), savedAt: new Date().toISOString() }
    case 'general':
    default:
      return { notes: extracted.generalNotes || null, academicYear: year, savedAt: new Date().toISOString() }
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  if (!(await isAuthorizedAnalyst(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // ── GET — student preview ──────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const schoolName = (event.queryStringParameters || {}).school_name || ''
    if (!schoolName.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'school_name is required' }) }
    }

    // Try exact match first (case-insensitive)
    let { data: exactMatches } = await supabase
      .from('student_schools')
      .select('student_id, school_name')
      .ilike('school_name', schoolName.trim())

    let matchedRows = exactMatches || []
    let matchType = 'exact'

    // Fall back to ILIKE partial if no exact results
    if (matchedRows.length === 0) {
      const { data: ilikeMatches } = await supabase
        .from('student_schools')
        .select('student_id, school_name')
        .ilike('school_name', `%${schoolName.trim()}%`)
      matchedRows = ilikeMatches || []
      matchType = 'partial'
    }

    if (matchedRows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ students: [], matchType: 'none', schoolNames: [] })
      }
    }

    // Fetch student names
    const studentIds = [...new Set(matchedRows.map(r => r.student_id))]
    const { data: studentRows } = await supabase
      .from('students')
      .select('id, student_name, preferred_name')
      .in('id', studentIds)

    const studentMap = {}
    for (const s of (studentRows || [])) {
      studentMap[s.id] = s.preferred_name || s.student_name || 'Unknown'
    }

    // Unique school names found (so analyst can see if ILIKE matched unintended schools)
    const schoolNames = [...new Set(matchedRows.map(r => r.school_name))]

    const students = matchedRows.map(r => ({
      studentId:   r.student_id,
      studentName: studentMap[r.student_id] || 'Unknown',
      schoolName:  r.school_name,
    }))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ students, matchType, schoolNames })
    }
  }

  // ── POST — save extracted data ─────────────────────────────────────────────
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { schoolName, docType, extracted } = body

    if (!schoolName || !docType || !extracted) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'schoolName, docType, and extracted are required' }) }
    }

    const storageKey = DOC_TYPE_KEYS[docType] || 'general'
    const docPayload = buildDocPayload(storageKey, extracted)

    // Read current documents for this school (needed for merge)
    const { data: existing } = await supabase
      .from('school_info')
      .select('documents')
      .ilike('school_name', schoolName.trim())
      .single()

    const currentDocs = (existing && existing.documents) ? existing.documents : {}

    // Merge: new key overwrites its own slot; all other keys preserved
    const mergedDocs = { ...currentDocs, [storageKey]: docPayload }

    // Upsert by school_name (case-insensitive match — find exact row then update, or insert new)
    // We use a two-step approach because Supabase upsert by text requires exact match
    if (existing) {
      // Row exists — update documents column
      const { error: updateErr } = await supabase
        .from('school_info')
        .update({ documents: mergedDocs, updated_at: new Date().toISOString() })
        .ilike('school_name', schoolName.trim())

      if (updateErr) throw updateErr
    } else {
      // New school — insert
      const { error: insertErr } = await supabase
        .from('school_info')
        .insert({ school_name: schoolName.trim(), documents: mergedDocs })

      if (insertErr) throw insertErr
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, docType: storageKey, schoolName: schoolName.trim() })
    }

  } catch (err) {
    console.error('save-school-doc error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
