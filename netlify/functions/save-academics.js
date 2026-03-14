// POST /api/save-academics
// Saves extracted data: grades, certifications, extraction log, optional profile updates
// Auth: X-Access-Token (parent token view) OR Supabase JWT with analyst role + studentId in body

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PARENT_EDITABLE = new Set([
  'student_name', 'preferred_name', 'dob', 'nationality',
  'current_school', 'current_year_group', 'curriculum', 'english_level',
  'primary_sport', 'goal', 'destination', 'budget_gbp', 'target_entry_year', 'photo_url',
])

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const {
      grades = [],
      certifications = [],
      term,
      academicYear,
      profileUpdates,
      docName,
      docType = 'other',
      rawJson,
      fileHash,
      studentId,
    } = body

    // ── Resolve student ID from auth ──────────────────────────────────────────
    let resolvedStudentId = null
    let extractedBy = null

    // Path 1: X-Access-Token (parent token view)
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid access token' }) }
      }
      resolvedStudentId = student.id
    } else {
      // Path 2: Supabase JWT (analyst)
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

      extractedBy = user.id

      const { data: profile } = await supabase
        .from('user_profiles').select('role, student_id').eq('id', user.id).single()

      if (profile && profile.role === 'analyst' && studentId) {
        // Analyst explicitly passing which student to save to
        resolvedStudentId = studentId
      } else if (profile && profile.student_id) {
        // Parent or analyst with own linked student
        resolvedStudentId = profile.student_id
      } else {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'No student linked to this account' }) }
      }
    }

    let gradesSaved = 0
    let certsSaved = 0

    // ── Save academic grades ─────────────────────────────────────────────────
    if (grades.length > 0) {
      let recordDate = new Date().toISOString().split('T')[0]
      if (academicYear) {
        const yearMatch = academicYear.match(/(\d{4})/)
        if (yearMatch) recordDate = `${yearMatch[1]}-06-30`
      }

      const gradeRows = grades
        .filter(g => g.subject && (g.grade || g.score !== null))
        .map(g => ({
          student_id:      resolvedStudentId,
          subject:         g.subject,
          grade:           g.grade || null,
          score:           g.score !== null && g.score !== undefined ? parseFloat(g.score) : null,
          max_score:       g.maxScore !== null && g.maxScore !== undefined ? parseFloat(g.maxScore) : null,
          term:            term || null,
          date:            recordDate,
          assessment_type: 'Report Card',
          notes:           academicYear ? `Academic year ${academicYear}` : null,
        }))

      if (gradeRows.length > 0) {
        const { error } = await supabase.from('student_academics').insert(gradeRows)
        if (error) throw error
        gradesSaved = gradeRows.length
      }
    }

    // ── Save certifications ──────────────────────────────────────────────────
    if (certifications.length > 0) {
      const certRows = certifications
        .filter(c => c.name)
        .map(c => ({
          student_id:   resolvedStudentId,
          category:     c.category || 'other',
          name:         c.name,
          issuer:       c.issuer || null,
          presenter:    c.presenter || null,
          score:        c.score ? String(c.score) : null,
          grade:        c.grade || null,
          date:         c.date || null,
          expiry_date:  c.expiryDate || null,
          notes:        c.notes || null,
        }))

      if (certRows.length > 0) {
        const { error } = await supabase.from('student_certifications').insert(certRows)
        if (error) throw error
        certsSaved = certRows.length
      }
    }

    // ── Log extraction ───────────────────────────────────────────────────────
    if (docName) {
      await supabase.from('document_extractions').insert({
        student_id:    resolvedStudentId,
        doc_name:      docName,
        doc_type:      docType,
        grades_saved:  gradesSaved,
        certs_saved:   certsSaved,
        extracted_by:  extractedBy,
        raw_json:      rawJson || null,
        file_hash:     fileHash || null,
      })
    }

    // ── Update student profile fields ────────────────────────────────────────
    if (profileUpdates && typeof profileUpdates === 'object') {
      const updates = {}
      for (const [key, val] of Object.entries(profileUpdates)) {
        if (PARENT_EDITABLE.has(key) && val !== null && val !== undefined && val !== '') {
          updates[key] = val
        }
      }
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString()
        const { error } = await supabase
          .from('students').update(updates).eq('id', resolvedStudentId)
        if (error) console.warn('Profile update partial fail:', error.message)
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, gradesSaved, certsSaved })
    }

  } catch (err) {
    console.error('save-academics error:', err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error', detail: err.message })
    }
  }
}
