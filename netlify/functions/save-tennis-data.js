// POST /api/save-tennis-data
// Routes tennis mutations by action field. Returns updated stats after every operation.
// Auth: X-Access-Token (token link) or Authorization: Bearer <jwt>
// student_id always comes from the authenticated token, never from the request body.

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Recompute stats — returned on every save/delete so the frontend stats bar refreshes immediately
async function computeStats(studentId) {
  const currentYear = new Date().getFullYear()

  const [allMatches, tournamentsResult] = await Promise.all([
    supabase.from('tennis_matches').select('result, match_date').eq('student_id', studentId),
    supabase
      .from('tennis_tournaments')
      .select('id')
      .eq('student_id', studentId)
      .eq('status', 'completed')
      .gte('start_date', `${currentYear}-01-01`)
      .lte('start_date', `${currentYear}-12-31`),
  ])

  const matches = allMatches.data || []
  const totalMatches = matches.length
  const wins = matches.filter(m => m.result === 'win').length
  const losses = matches.filter(m => m.result === 'loss').length
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 1000) / 10 : 0
  const matchesThisYear = matches.filter(m => {
    if (!m.match_date) return false
    return new Date(m.match_date).getFullYear() === currentYear
  }).length
  const tournamentsThisYear = (tournamentsResult.data || []).length

  return { totalMatches, wins, losses, winRate, matchesThisYear, tournamentsThisYear }
}

// Verify a row belongs to the authenticated student before deleting
async function verifyOwnership(table, id, studentId) {
  const { data: row, error } = await supabase.from(table).select('student_id').eq('id', id).single()
  if (error || !row) return false
  return row.student_id === studentId
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Access-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  try {
    const body = JSON.parse(event.body || '{}')
    const { action } = body

    if (!action) return { statusCode: 400, headers, body: JSON.stringify({ error: 'action is required' }) }

    let studentId = null
    let isAnalyst = false

    // ── Auth path 1: X-Access-Token (token link) ───────────────────────────────
    const accessToken = event.headers['x-access-token'] || event.headers['X-Access-Token']
    if (accessToken) {
      const { data: student, error } = await supabase
        .from('students').select('id').eq('access_token', accessToken).single()
      if (error || !student) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid access token' }) }
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
      isAnalyst = profile.role === 'analyst' || profile.role === 'admin'
      // Analyst can save for a specific student via body.target_student_id
      if (isAnalyst && body.target_student_id) {
        studentId = body.target_student_id
      } else {
        studentId = profile.student_id
      }
    }

    if (!studentId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No student linked to this session' }) }

    // ── Route by action ────────────────────────────────────────────────────────

    // save_profile — upsert tennis_profiles
    if (action === 'save_profile') {
      const { dominant_hand, backhand_style, current_coach, current_academy, training_hours_per_week, years_playing } = body
      const { error } = await supabase.from('tennis_profiles').upsert(
        {
          student_id: studentId,
          dominant_hand: dominant_hand || null,
          backhand_style: backhand_style || null,
          current_coach: current_coach || null,
          current_academy: current_academy || null,
          training_hours_per_week: training_hours_per_week != null ? Number(training_hours_per_week) : null,
          years_playing: years_playing != null ? Number(years_playing) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id' }
      )
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // save_match — insert or update tennis_matches
    if (action === 'save_match') {
      const { id, match_date, tournament_name, opponent_name, score, result, notes } = body
      if (!match_date || !tournament_name || !score || !result) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'match_date, tournament_name, score, and result are required' }) }
      }
      if (id) {
        const owned = await verifyOwnership('tennis_matches', id, studentId)
        if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to edit this match' }) }
        const { error } = await supabase.from('tennis_matches').update({
          match_date, tournament_name, opponent_name: opponent_name || null,
          score, result, notes: notes || null,
        }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tennis_matches').insert({
          student_id: studentId, match_date, tournament_name,
          opponent_name: opponent_name || null, score, result, notes: notes || null,
        })
        if (error) throw error
      }
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // delete_match
    if (action === 'delete_match') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
      const owned = await verifyOwnership('tennis_matches', id, studentId)
      if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to delete this match' }) }
      const { error } = await supabase.from('tennis_matches').delete().eq('id', id)
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // save_tournament — insert or update tennis_tournaments
    if (action === 'save_tournament') {
      const { id, tournament_name, start_date, end_date, location, category, status, result, notes } = body
      if (!tournament_name || !start_date) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'tournament_name and start_date are required' }) }
      }
      if (id) {
        const owned = await verifyOwnership('tennis_tournaments', id, studentId)
        if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to edit this tournament' }) }
        const { error } = await supabase.from('tennis_tournaments').update({
          tournament_name, start_date, end_date: end_date || null,
          location: location || null, category: category || null,
          status: status || 'planning', result: result || null, notes: notes || null,
        }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tennis_tournaments').insert({
          student_id: studentId, tournament_name, start_date, end_date: end_date || null,
          location: location || null, category: category || null,
          status: status || 'planning', result: result || null, notes: notes || null,
        })
        if (error) throw error
      }
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // delete_tournament
    if (action === 'delete_tournament') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
      const owned = await verifyOwnership('tennis_tournaments', id, studentId)
      if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to delete this tournament' }) }
      const { error } = await supabase.from('tennis_tournaments').delete().eq('id', id)
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // save_ranking — always insert (one entry per log)
    if (action === 'save_ranking') {
      const { log_date, ranking_type, ranking_value, notes } = body
      if (!log_date || !ranking_type || ranking_value == null) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'log_date, ranking_type, and ranking_value are required' }) }
      }
      const { error } = await supabase.from('tennis_rankings').insert({
        student_id: studentId,
        log_date, ranking_type,
        ranking_value: Number(ranking_value),
        notes: notes || null,
      })
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // delete_ranking
    if (action === 'delete_ranking') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
      const owned = await verifyOwnership('tennis_rankings', id, studentId)
      if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to delete this ranking' }) }
      const { error } = await supabase.from('tennis_rankings').delete().eq('id', id)
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // save_note — insert (author from body)
    if (action === 'save_note') {
      const { note_date, content, author } = body
      if (!note_date || !content || !author) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'note_date, content, and author are required' }) }
      }
      const { error } = await supabase.from('tennis_notes').insert({
        student_id: studentId,
        note_date, content, author,
      })
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    // delete_note — analyst can delete any; parent can only delete their own (ownership check)
    if (action === 'delete_note') {
      const { id } = body
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) }
      if (!isAnalyst) {
        const owned = await verifyOwnership('tennis_notes', id, studentId)
        if (!owned) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not authorized to delete this note' }) }
      }
      const { error } = await supabase.from('tennis_notes').delete().eq('id', id)
      if (error) throw error
      const stats = await computeStats(studentId)
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stats }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) }

  } catch (err) {
    console.error('save-tennis-data error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}
