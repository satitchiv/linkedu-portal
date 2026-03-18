// GET  /api/golf-trackman?student_id=xxx         — fetch all sessions
// POST /api/golf-trackman                        — log new session (analyst only)
// POST /api/golf-trackman?action=reanalyze&session_id=xxx — re-run AI (analyst only)
// DELETE /api/golf-trackman?session_id=xxx       — delete session (analyst only)

const { createClient } = require('@supabase/supabase-js')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getGeminiKey() {
  const envKey = process.env.GEMINI_API_KEY
  if (envKey && envKey.startsWith('AIza')) return envKey
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const match = envFile.match(/^GEMINI_API_KEY=(.+)$/m)
    if (match) return match[1].trim()
  } catch (e) {}
  return envKey
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    // Verify Supabase JWT
    const token = (event.headers.authorization || '').replace('Bearer ', '')
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!profile) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) }

    const isAnalyst = profile.role === 'analyst' || profile.role === 'admin'
    const qs = event.queryStringParameters || {}

    // ── GET — fetch sessions ─────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const ownStudentId = profile.student_id
      const requestedId = qs.student_id || ownStudentId

      if (!requestedId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }
      }

      // Non-analysts can only read their own student
      if (!isAnalyst && requestedId !== ownStudentId) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }
      }

      const { data: sessions, error } = await supabase
        .from('golf_trackman_sessions')
        .select('*')
        .eq('student_id', requestedId)
        .order('session_date', { ascending: false })

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ sessions: sessions || [] }) }
    }

    // ── DELETE — analyst only ────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      if (!isAnalyst) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }

      const sessionId = qs.session_id
      if (!sessionId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id required' }) }

      const { error } = await supabase
        .from('golf_trackman_sessions')
        .delete()
        .eq('id', sessionId)

      if (error) throw error
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) }
    }

    // ── POST — analyst only ──────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      if (!isAnalyst) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) }

      const body = JSON.parse(event.body || '{}')
      const action = qs.action

      // ── Re-analyze existing session ─────────────────────────────────────
      if (action === 'reanalyze') {
        const sessionId = qs.session_id
        if (!sessionId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_id required' }) }

        const { data: session, error: fetchErr } = await supabase
          .from('golf_trackman_sessions')
          .select('*')
          .eq('id', sessionId)
          .single()

        if (fetchErr || !session) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'Session not found' }) }
        }

        const { data: prevRows } = await supabase
          .from('golf_trackman_sessions')
          .select('*')
          .eq('student_id', session.student_id)
          .lt('session_date', session.session_date)
          .order('session_date', { ascending: false })
          .limit(1)

        const aiAnalysis = await generateAIAnalysis(session, prevRows?.[0] || null, body.student_info || {})

        const { data: updated, error: updateErr } = await supabase
          .from('golf_trackman_sessions')
          .update({ ai_analysis: aiAnalysis })
          .eq('id', sessionId)
          .select()
          .single()

        if (updateErr) throw updateErr
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, session: updated }) }
      }

      // ── New session ─────────────────────────────────────────────────────
      const { student_id, notion_student_id, session_date, session_notes, location, club_data, student_info } = body

      if (!student_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'student_id required' }) }
      if (!session_date) return { statusCode: 400, headers, body: JSON.stringify({ error: 'session_date required' }) }
      if (!club_data || !club_data.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'club_data required' }) }

      // Insert without AI first (fast response to user)
      const { data: newSession, error: insertErr } = await supabase
        .from('golf_trackman_sessions')
        .insert({
          student_id,
          notion_student_id: notion_student_id || null,
          session_date,
          session_notes: session_notes || null,
          location: location || null,
          entered_by_id: user.id,
          entered_by_role: profile.role,
          club_data,
          ai_analysis: null,
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      // Fetch previous session for trend comparison
      const { data: prevRows } = await supabase
        .from('golf_trackman_sessions')
        .select('*')
        .eq('student_id', student_id)
        .lt('session_date', session_date)
        .order('session_date', { ascending: false })
        .limit(1)

      // Generate AI analysis
      const aiAnalysis = await generateAIAnalysis(newSession, prevRows?.[0] || null, student_info || {})

      const { data: finalSession, error: updateErr } = await supabase
        .from('golf_trackman_sessions')
        .update({ ai_analysis: aiAnalysis })
        .eq('id', newSession.id)
        .select()
        .single()

      if (updateErr) throw updateErr
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, session: finalSession }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  } catch (err) {
    console.error('golf-trackman error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', detail: err.message }) }
  }
}

// ── AI Analysis ────────────────────────────────────────────────────────────
async function generateAIAnalysis(session, previousSession, studentInfo) {
  try {
    const { name = 'the student', age = '', handicap = '' } = studentInfo

    const formattedClubData = (session.club_data || []).map(c => {
      const lines = [`Club: ${c.club} (${c.shots || 0} shots)`]
      if (c.ball_speed_avg  != null) lines.push(`  Ball Speed: ${c.ball_speed_avg} mph`)
      if (c.club_speed_avg  != null) lines.push(`  Club Speed: ${c.club_speed_avg} mph`)
      if (c.smash_factor_avg != null) lines.push(`  Smash Factor: ${c.smash_factor_avg}`)
      if (c.launch_angle_avg != null) lines.push(`  Launch Angle: ${c.launch_angle_avg}°`)
      if (c.launch_direction_avg != null) lines.push(`  Launch Direction: ${c.launch_direction_avg}°`)
      if (c.spin_rate_avg   != null) lines.push(`  Spin Rate: ${c.spin_rate_avg} rpm`)
      if (c.spin_axis_avg   != null) lines.push(`  Spin Axis: ${c.spin_axis_avg}°`)
      if (c.carry_distance_avg != null) lines.push(`  Carry Distance: ${c.carry_distance_avg} yds`)
      if (c.total_distance_avg != null) lines.push(`  Total Distance: ${c.total_distance_avg} yds`)
      if (c.side_distance_avg  != null) lines.push(`  Side Distance: ${c.side_distance_avg} yds`)
      if (c.face_angle_avg  != null) lines.push(`  Face Angle: ${c.face_angle_avg}°`)
      if (c.club_path_avg   != null) lines.push(`  Club Path: ${c.club_path_avg}°`)
      if (c.attack_angle_avg != null) lines.push(`  Attack Angle: ${c.attack_angle_avg}°`)
      if (c.dynamic_loft_avg != null) lines.push(`  Dynamic Loft: ${c.dynamic_loft_avg}°`)
      return lines.join('\n')
    }).join('\n\n')

    let prevDataText = 'No prior session.'
    if (previousSession && previousSession.club_data) {
      const prevLines = previousSession.club_data.map(c => {
        const parts = [`${c.club}:`]
        if (c.ball_speed_avg  != null) parts.push(`Ball Speed ${c.ball_speed_avg}mph`)
        if (c.smash_factor_avg != null) parts.push(`Smash ${c.smash_factor_avg}`)
        if (c.carry_distance_avg != null) parts.push(`Carry ${c.carry_distance_avg}yds`)
        if (c.spin_rate_avg   != null) parts.push(`Spin ${c.spin_rate_avg}rpm`)
        return parts.join(' · ')
      })
      prevDataText = `PREVIOUS SESSION (${previousSession.session_date}):\n${prevLines.join('\n')}`
    }

    const prompt = `You are a professional golf performance analyst specializing in junior golfer development for UK boarding school scholarship pathways.

STUDENT: ${name}${age ? ', age ' + age : ''}${handicap ? ', handicap ' + handicap : ''}
GOAL: UK boarding school golf scholarship

SESSION: ${session.session_date} at ${session.location || 'practice facility'}
${session.session_notes || ''}

METRICS (averages per club):
${formattedClubData}

${prevDataText}

BENCHMARKS (UK junior scholarship level, age 15-17):
- Driver: ball speed 140-155mph, smash factor 1.42-1.48, launch 12-15°, spin 2,200-2,800rpm
- 7-Iron: ball speed 100-115mph, carry 150-165yds, launch 18-22°
- PW: carry 100-120yds, spin 6,000-8,000rpm

Return ONLY valid JSON (no markdown, no code fences):
{
  "pros": ["metric-backed string", "metric-backed string", "metric-backed string"],
  "cons": ["metric-backed string", "metric-backed string", "metric-backed string"],
  "drills": [{"title":"","description":""}, {"title":"","description":""}, {"title":"","description":""}],
  "overall_assessment": "2-3 sentences for coach",
  "benchmark_context": "1 sentence vs scholarship benchmarks",
  "vs_last_session": { "improved": [], "regressed": [] },
  "generated_at": "${new Date().toISOString()}"
}`

    const genAI = new GoogleGenerativeAI(getGeminiKey())
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    let text = result.response.text().trim()

    // Strip markdown code fences if present
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

    const parsed = JSON.parse(text)
    parsed.generated_at = new Date().toISOString()
    return parsed

  } catch (e) {
    console.error('Trackman AI analysis error:', e)
    return {
      pros: [],
      cons: [],
      drills: [],
      overall_assessment: 'AI analysis unavailable — please re-analyse.',
      benchmark_context: '',
      vs_last_session: { improved: [], regressed: [] },
      generated_at: new Date().toISOString(),
      error: e.message,
    }
  }
}
