// POST /api/camp-application
// Create, update stage, or delete a camp application (analyst only)
// Actions:
//   create  — { action:'create', student_id, camp_name, camp_url, camp_recommendation_id? }
//   update  — { action:'update', id, stage }
//   delete  — { action:'delete', id }

const { createClient } = require('@supabase/supabase-js')
const { isAuthorizedAnalyst } = require('./utils/auth')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VALID_STAGES = ['research','enquire','applied','accepted','deposit_paid','full_payment','visa_travel','completed']

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Secret',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  if (!await isAuthorizedAnalyst(event)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { action } = body

    if (action === 'create') {
      const { student_id, camp_name, camp_url, camp_recommendation_id } = body
      if (!student_id || !camp_name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id and camp_name required' }) }

      const { start_date, end_date } = body
      const { data, error } = await supabase
        .from('student_camp_applications')
        .insert({
          student_id,
          camp_name,
          camp_url:             camp_url || null,
          camp_recommendation_id: camp_recommendation_id || null,
          stage:                'research',
          start_date:           start_date || null,
          end_date:             end_date || null,
          updated_at:           new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, application: data }) }
    }

    if (action === 'update') {
      const { id, stage, notes } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }
      if (stage && !VALID_STAGES.includes(stage)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid stage' }) }

      const { start_date, end_date } = body
      const updates = { updated_at: new Date().toISOString() }
      if (stage) updates.stage = stage
      if (notes !== undefined) updates.notes = notes
      if (start_date !== undefined) updates.start_date = start_date || null
      if (end_date !== undefined) updates.end_date = end_date || null

      const { error } = await supabase
        .from('student_camp_applications')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id required' }) }

      const { error } = await supabase
        .from('student_camp_applications')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) }
  } catch (err) {
    console.error('camp-application error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
