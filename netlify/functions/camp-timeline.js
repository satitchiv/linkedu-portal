// POST /api/camp-timeline
// CRUD for camp timeline items (analyst only)
// Actions: add, update-date, save-note, mark-done, undo-done, delete

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

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
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const isAnalyst = await isAuthorizedAnalyst(event)

  try {
    const body = JSON.parse(event.body || '{}')
    const { action } = body

    // ── Add custom item (analyst only) ──────────────────────────────────────
    if (action === 'add') {
      if (!isAnalyst) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { camp_application_id, student_id, title, date, notes } = body
      if (!camp_application_id || !title) return { statusCode: 400, headers, body: JSON.stringify({ error: 'camp_application_id and title required' }) }
      const { data, error } = await supabase.from('camp_timeline_items').insert({
        camp_application_id, student_id, item_type: 'custom', title, date: date || null, notes: notes || null,
      }).select().single()
      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, item: data }) }
    }

    // ── Update date/notes for a base item (upsert) ──────────────────────────
    if (action === 'update-base') {
      if (!isAnalyst) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { camp_application_id, student_id, stage_key, title, date, notes, existing_id } = body
      if (!camp_application_id || !stage_key) return { statusCode: 400, headers, body: JSON.stringify({ error: 'camp_application_id and stage_key required' }) }
      let data, error
      if (existing_id) {
        ;({ data, error } = await supabase.from('camp_timeline_items')
          .update({ date: date || null, notes: notes || null })
          .eq('id', existing_id).select().single())
      } else {
        ;({ data, error } = await supabase.from('camp_timeline_items').insert({
          camp_application_id, student_id, item_type: 'base',
          title, date: date || null,
          notes: `stage:${stage_key}${notes ? ' ' + notes : ''}`,
        }).select().single())
      }
      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, item: data }) }
    }

    // ── Save note (analyst or parent) ────────────────────────────────────────
    if (action === 'save-note') {
      const { id, note, is_parent } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }
      const field = is_parent ? { parent_note: note || null } : { notes: note || null }
      if (!is_parent && !isAnalyst) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { error } = await supabase.from('camp_timeline_items').update(field).eq('id', id)
      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    // ── Mark custom item done / undo ─────────────────────────────────────────
    if (action === 'mark-done' || action === 'undo-done') {
      if (!isAnalyst) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }
      const newType = action === 'mark-done' ? 'custom_done' : 'custom'
      const { error } = await supabase.from('camp_timeline_items').update({ item_type: newType }).eq('id', id)
      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!isAnalyst) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }
      const { error } = await supabase.from('camp_timeline_items').delete().eq('id', id)
      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) }
  } catch (err) {
    console.error('camp-timeline error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
