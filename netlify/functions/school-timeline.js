// /api/school-timeline
// GET    ?student_school_id=xxx  — returns all timeline items for that school (JWT required)
// POST   { student_school_id, student_id, title, date, notes, item_type } — insert (admin only)
// PATCH  { id, title, date, notes, parent_note } — update item (admin: all fields; JWT: parent_note only)
// DELETE { id } — delete item (admin only)

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  const method = event.httpMethod

  // ── GET: requires valid JWT ────────────────────────────────────────────────
  if (method === 'GET') {
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const studentSchoolId = event.queryStringParameters && event.queryStringParameters.student_school_id
    if (!studentSchoolId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_school_id is required' }) }
    }

    const { data, error } = await supabase
      .from('school_timeline_items')
      .select('*')
      .eq('student_school_id', studentSchoolId)
      .order('date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return { statusCode: 200, headers, body: JSON.stringify({ items: data || [] }) }
  }

  // ── PATCH: admin can update all fields; parent JWT can only update parent_note ──
  if (method === 'PATCH') {
    try {
      const body = JSON.parse(event.body || '{}')
      const { id, title, date, notes, parent_note } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }

      const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
      const isAdmin = secret && secret === process.env.ADMIN_SECRET

      if (isAdmin) {
        // Admin: allow updating all fields
        const { item_type } = body
        const updates = {}
        if (title       !== undefined) updates.title       = title
        if (date        !== undefined) updates.date        = date || null
        if (notes       !== undefined) updates.notes       = notes || null
        if (parent_note !== undefined) updates.parent_note = parent_note || null
        if (item_type   !== undefined) updates.item_type   = item_type || 'custom'

        const { data, error } = await supabase
          .from('school_timeline_items')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) { console.error('school-timeline PATCH admin error:', error); throw error }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, item: data }) }
      }

      // Try JWT auth for parent_note only
      const token = (event.headers.authorization || '').replace('Bearer ', '')
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

      if (parent_note === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'parent_note is required for parent updates' }) }
      }

      const { data, error } = await supabase
        .from('school_timeline_items')
        .update({ parent_note: parent_note || null })
        .eq('id', id)
        .select()
        .single()

      if (error) { console.error('school-timeline PATCH parent error:', error); throw error }
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, item: data }) }

    } catch (err) {
      console.error('school-timeline PATCH error:', err)
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
    }
  }

  // ── POST / DELETE: require X-Admin-Secret ─────────────────────────────────
  const secret = event.headers['x-admin-secret'] || event.headers['X-Admin-Secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')

    if (method === 'POST') {
      const { student_school_id, student_id, title, date, notes, item_type } = body
      if (!student_school_id || !student_id || !title) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_school_id, student_id and title are required' }) }
      }

      const { data, error } = await supabase
        .from('school_timeline_items')
        .insert({ student_school_id, student_id, title, date: date || null, notes: notes || null, item_type: item_type || 'custom' })
        .select()
        .single()

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, item: data }) }
    }

    if (method === 'DELETE') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }

      const { error } = await supabase
        .from('school_timeline_items')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  } catch (err) {
    console.error('school-timeline error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
