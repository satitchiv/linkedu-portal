// POST /api/save-smart-doc
// Analyst-only. Routes a flat list of extracted items to multiple DB destinations.
// Destinations: timeline, deadline, profile_dob, profile_academic, profile_cert, school_info, etc (skipped).
// Uses batch inserts and pre-fetched dedup sets to minimise DB round trips.

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function sanitizeDate(val) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}$/.test(s)) return `${s}-06-30`
  return null
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!(await isAuthorizedAnalyst(event))) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { items, studentId, schoolMappings, schoolName } = body

    if (!studentId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'studentId is required' }) }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'items array is required' }) }
    }

    const saved    = { timeline: 0, deadline: 0, profile_basic: 0, profile_dob: 0, profile_academic: 0, profile_cert: 0, school_info: 0 }
    const skipped  = {}
    const errors   = []

    // ── Prefetch existing rows for dedup (one query per entity type) ──────────
    const [existingTimelineRes, existingAcademicsRes, existingCertsRes, studentRes] = await Promise.all([
      supabase.from('school_timeline_items').select('title, date').eq('student_id', studentId),
      supabase.from('student_academics').select('subject, term, date').eq('student_id', studentId),
      supabase.from('student_certifications').select('name, date').eq('student_id', studentId),
      supabase.from('students').select('dob').eq('id', studentId).single(),
    ])

    const existingTimeline = new Set(
      (existingTimelineRes.data || []).map(r => `${r.title}||${r.date || ''}`)
    )
    const existingAcademics = new Set(
      (existingAcademicsRes.data || []).map(r => `${r.subject}||${r.term || ''}||${r.date || ''}`)
    )
    const existingCerts = new Set(
      (existingCertsRes.data || []).map(r => `${r.name}||${r.date || ''}`)
    )
    const currentDob = studentRes.data?.dob || null

    // ── Collect batch arrays ──────────────────────────────────────────────────
    const timelineRows = []
    const academicRows = []
    const certRows     = []

    let dobItem       = null
    const schoolInfoItems  = []
    const profileBasicItems = []

    for (const item of items) {
      const dest = item.destination

      // ── timeline ─────────────────────────────────────────────────────────
      if (dest === 'timeline' || dest === 'deadline') {
        const title = dest === 'deadline' ? `Deadline: ${item.title}` : item.title
        const date  = sanitizeDate(item.value)
        if (!date) {
          skipped.timeline = (skipped.timeline || 0) + 1
          continue
        }
        const key   = `${title}||${date}`
        if (existingTimeline.has(key)) {
          skipped.timeline = (skipped.timeline || 0) + 1
          continue
        }
        const studentSchoolId = (schoolMappings && item.schoolName && schoolMappings[item.schoolName])
          || (schoolMappings && Object.values(schoolMappings)[0])
          || null
        timelineRows.push({
          student_school_id: studentSchoolId,
          student_id:        studentId,
          title,
          date,
          notes:             item.notes || null,
          item_type:         'custom',
        })
        existingTimeline.add(key) // prevent dupes within same batch
        if (dest === 'deadline') saved.deadline++
        else saved.timeline++
      }

      // ── profile_dob ───────────────────────────────────────────────────────
      else if (dest === 'profile_dob') {
        if (!dobItem) dobItem = item
      }

      // ── profile_academic ──────────────────────────────────────────────────
      else if (dest === 'profile_academic') {
        const subject = item.meta?.subject || item.title
        const term    = item.meta?.term || null
        const date    = sanitizeDate(item.value)
        const key     = `${subject}||${term || ''}||${date || ''}`
        if (existingAcademics.has(key)) {
          skipped.profile_academic = (skipped.profile_academic || 0) + 1
          continue
        }
        academicRows.push({
          student_id:      studentId,
          subject,
          grade:           item.meta?.grade || null,
          score:           item.meta?.score !== undefined ? parseFloat(item.meta.score) || null : null,
          max_score:       item.meta?.maxScore !== undefined ? parseFloat(item.meta.maxScore) || null : null,
          term,
          date,
          assessment_type: 'Report Card',
          notes:           item.notes || null,
        })
        existingAcademics.add(key)
        saved.profile_academic++
      }

      // ── profile_cert ──────────────────────────────────────────────────────
      else if (dest === 'profile_cert') {
        const name = item.meta?.certName || item.title
        const date = sanitizeDate(item.value)
        const key  = `${name}||${date || ''}`
        if (existingCerts.has(key)) {
          skipped.profile_cert = (skipped.profile_cert || 0) + 1
          continue
        }
        certRows.push({
          student_id:  studentId,
          category:    item.meta?.category || 'other',
          name,
          issuer:      item.meta?.issuer || null,
          score:       item.meta?.score ? String(item.meta.score) : null,
          grade:       item.meta?.grade || null,
          date,
          expiry_date: sanitizeDate(item.meta?.expiryDate),
          notes:       item.notes || null,
        })
        existingCerts.add(key)
        saved.profile_cert++
      }

      // ── profile_basic ─────────────────────────────────────────────────────
      else if (dest === 'profile_basic') {
        profileBasicItems.push(item)
      }

      // ── school_info ───────────────────────────────────────────────────────
      else if (dest === 'school_info') {
        schoolInfoItems.push(item)
      }

      // ── etc — skip ────────────────────────────────────────────────────────
    }

    // ── Batch inserts ─────────────────────────────────────────────────────────
    if (timelineRows.length) {
      const { error } = await supabase.from('school_timeline_items').insert(timelineRows)
      if (error) {
        errors.push({ destination: 'timeline', error: error.message })
        saved.timeline = 0
        saved.deadline = 0
      }
    }

    if (academicRows.length) {
      const { error } = await supabase.from('student_academics').insert(academicRows)
      if (error) {
        errors.push({ destination: 'profile_academic', error: error.message })
        saved.profile_academic = 0
      }
    }

    if (certRows.length) {
      const { error } = await supabase.from('student_certifications').insert(certRows)
      if (error) {
        errors.push({ destination: 'profile_cert', error: error.message })
        saved.profile_cert = 0
      }
    }

    // ── profile_dob ───────────────────────────────────────────────────────────
    if (dobItem) {
      if (currentDob) {
        skipped.profile_dob = { reason: 'DOB already set', existingValue: currentDob }
      } else {
        const dobVal = sanitizeDate(dobItem.value)
        if (dobVal) {
          const { error } = await supabase.from('students').update({ dob: dobVal }).eq('id', studentId)
          if (error) {
            errors.push({ destination: 'profile_dob', error: error.message })
          } else {
            saved.profile_dob = 1
          }
        } else {
          skipped.profile_dob = { reason: 'Invalid date format', value: dobItem.value }
        }
      }
    }

    // ── profile_basic ─────────────────────────────────────────────────────────
    if (profileBasicItems.length) {
      const ALLOWED_FIELDS = ['student_name', 'preferred_name', 'nationality', 'current_school', 'current_year_group']
      const updateObj = {}
      for (const item of profileBasicItems) {
        const field = item.meta?.field
        if (!field || !ALLOWED_FIELDS.includes(field)) continue
        const val = item.value ? String(item.value).trim() : null
        if (val) updateObj[field] = val
      }
      if (Object.keys(updateObj).length > 0) {
        const { error } = await supabase.from('students').update(updateObj).eq('id', studentId)
        if (error) {
          errors.push({ destination: 'profile_basic', error: error.message })
        } else {
          saved.profile_basic = Object.keys(updateObj).length
        }
      }
    }

    // ── school_info ───────────────────────────────────────────────────────────
    if (schoolInfoItems.length) {
      try {
        // Resolve canonical school name via student_school_id lookup
        let canonicalName = schoolName || null
        const mappingValues = schoolMappings ? Object.values(schoolMappings) : []
        if (mappingValues.length > 0) {
          const { data: ss } = await supabase
            .from('student_schools').select('school_name').eq('id', mappingValues[0]).single()
          if (ss) canonicalName = ss.school_name
        }

        if (canonicalName) {
          // Exact match first (no wildcards)
          let existing = null
          const { data: exactMatch } = await supabase
            .from('school_info').select('school_name, documents')
            .ilike('school_name', canonicalName)
            .single()
          existing = exactMatch

          // ILIKE partial fallback
          if (!existing) {
            const { data: partialMatches } = await supabase
              .from('school_info').select('school_name, documents')
              .ilike('school_name', `%${canonicalName}%`)
              .limit(1)
            existing = partialMatches && partialMatches[0] ? partialMatches[0] : null
          }

          const currentDocs = (existing && existing.documents) ? existing.documents : {}
          const currentMiscItems = Array.isArray(currentDocs.misc_items) ? currentDocs.misc_items : []
          const newMiscItems = schoolInfoItems.map(item => ({
            title:      item.title,
            value:      item.value,
            notes:      item.notes || null,
            confidence: item.confidence || null,
            savedAt:    new Date().toISOString(),
          }))
          const mergedDocs = { ...currentDocs, misc_items: [...currentMiscItems, ...newMiscItems] }

          if (existing) {
            const { error } = await supabase
              .from('school_info')
              .update({ documents: mergedDocs, updated_at: new Date().toISOString() })
              .ilike('school_name', existing.school_name)
            if (error) throw error
          } else {
            const { error } = await supabase
              .from('school_info')
              .insert({ school_name: canonicalName, documents: mergedDocs })
            if (error) throw error
          }
          saved.school_info = schoolInfoItems.length
        } else {
          skipped.school_info = { reason: 'No school name resolved — school_info items not saved' }
        }
      } catch (err) {
        errors.push({ destination: 'school_info', error: err.message })
      }
    }

    // Remove zero-count destinations from saved
    for (const key of Object.keys(saved)) {
      if (saved[key] === 0) delete saved[key]
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, saved, skipped, errors }),
    }

  } catch (err) {
    console.error('save-smart-doc error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message }),
    }
  }
}
