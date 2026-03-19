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

    // ── Pre-compute data quality flags ──────────────────────────────────────
    const clubFlagSummaries = []
    ;(session.club_data || []).forEach(c => {
      const flags = []
      const isDriver = (c.club || '').toLowerCase().includes('driver')

      // Shot count null with metrics present
      if (c.shots == null && (c.ball_speed_avg != null || c.carry_distance_avg != null)) {
        flags.push('Shot count not recorded — metrics present but may represent a subset of swings')
      }

      // Carry vs total distance inconsistency
      if (c.carry_distance_avg != null && c.total_distance_avg != null) {
        if (c.total_distance_avg < c.carry_distance_avg) {
          flags.push(`INCONSISTENCY: Total Distance (${c.total_distance_avg}yds) is less than Carry (${c.carry_distance_avg}yds) — physically impossible, data capture error`)
        } else if (c.carry_distance_avg > 0 && c.total_distance_avg > c.carry_distance_avg * 2.5) {
          flags.push(`INCONSISTENCY: Total Distance (${c.total_distance_avg}yds) is ${(c.total_distance_avg / c.carry_distance_avg).toFixed(1)}x Carry (${c.carry_distance_avg}yds) — implausible, likely data capture error`)
        }
      }

      // Driver-specific sanity checks
      if (isDriver) {
        if (c.spin_rate_avg != null && c.spin_rate_avg < 1000) {
          flags.push(`INCONSISTENCY: Spin rate ${c.spin_rate_avg}rpm is implausibly low for a driver (realistic minimum ~1,500rpm)`)
        }
        if (c.carry_distance_avg != null && c.carry_distance_avg < 50) {
          flags.push(`INCONSISTENCY: Carry distance ${c.carry_distance_avg}yds is implausibly low for a driver`)
        }
        if (c.launch_angle_avg != null && c.launch_angle_avg > 25) {
          flags.push(`INCONSISTENCY: Launch angle ${c.launch_angle_avg}° is unusually high for a driver — possible data capture error`)
        }
      }

      // Spin axis — always flag regardless of data confidence
      if (c.spin_axis_avg != null && Math.abs(c.spin_axis_avg) >= 20) {
        const dir = c.spin_axis_avg > 0 ? 'slice' : 'hook'
        flags.push(`HIGH-SIGNAL: Spin Axis ${c.spin_axis_avg}° indicates severe ${dir} bias — must appear in analysis regardless of data confidence`)
      }

      // Face/path delta — always flag regardless of data confidence
      if (c.face_angle_avg != null && c.club_path_avg != null) {
        const delta = Math.abs(c.face_angle_avg - c.club_path_avg)
        if (delta >= 3) {
          flags.push(`HIGH-SIGNAL: Face-to-Path delta ${delta.toFixed(1)}° (Face: ${c.face_angle_avg}°, Path: ${c.club_path_avg}°) — significant shot-shape driver, must appear in analysis`)
        }
      }

      if (flags.length > 0) {
        clubFlagSummaries.push(`${c.club}:\n` + flags.map(f => `  - ${f}`).join('\n'))
      }
    })

    const flagSection = clubFlagSummaries.length > 0
      ? `\nDATA FLAGS (pre-computed — address every one of these in your analysis):\n${clubFlagSummaries.join('\n')}\n`
      : '\nDATA FLAGS: None — data appears internally consistent.\n'

    // ── Format club data ────────────────────────────────────────────────────
    const formattedClubData = (session.club_data || []).map(c => {
      const shotStr = c.shots != null ? ` (${c.shots} shots)` : ' (shot count not recorded)'
      const lines = [`Club: ${c.club}${shotStr}`]
      if (c.ball_speed_avg    != null) lines.push(`  Ball Speed: ${c.ball_speed_avg} mph`)
      if (c.club_speed_avg    != null) lines.push(`  Club Speed: ${c.club_speed_avg} mph`)
      if (c.smash_factor_avg  != null) lines.push(`  Smash Factor: ${c.smash_factor_avg}`)
      if (c.launch_angle_avg  != null) lines.push(`  Launch Angle: ${c.launch_angle_avg}°`)
      if (c.launch_direction_avg != null) lines.push(`  Launch Direction: ${c.launch_direction_avg}°`)
      if (c.spin_rate_avg     != null) lines.push(`  Spin Rate: ${c.spin_rate_avg} rpm`)
      if (c.spin_axis_avg     != null) lines.push(`  Spin Axis: ${c.spin_axis_avg}°`)
      if (c.carry_distance_avg != null) lines.push(`  Carry Distance: ${c.carry_distance_avg} yds`)
      if (c.total_distance_avg != null) lines.push(`  Total Distance: ${c.total_distance_avg} yds`)
      if (c.side_distance_avg  != null) lines.push(`  Side Distance: ${c.side_distance_avg} yds`)
      if (c.face_angle_avg    != null) lines.push(`  Face Angle: ${c.face_angle_avg}°`)
      if (c.club_path_avg     != null) lines.push(`  Club Path: ${c.club_path_avg}°`)
      if (c.attack_angle_avg  != null) lines.push(`  Attack Angle: ${c.attack_angle_avg}°`)
      if (c.dynamic_loft_avg  != null) lines.push(`  Dynamic Loft: ${c.dynamic_loft_avg}°`)
      return lines.join('\n')
    }).join('\n\n')

    // ── Format previous session ─────────────────────────────────────────────
    let prevDataText = 'PREVIOUS SESSION: None on record.'
    if (previousSession && previousSession.club_data) {
      const prevLines = previousSession.club_data.map(c => {
        const parts = [`${c.club}:`]
        if (c.ball_speed_avg    != null) parts.push(`Ball Speed ${c.ball_speed_avg}mph`)
        if (c.smash_factor_avg  != null) parts.push(`Smash ${c.smash_factor_avg}`)
        if (c.carry_distance_avg != null) parts.push(`Carry ${c.carry_distance_avg}yds`)
        if (c.spin_rate_avg     != null) parts.push(`Spin ${c.spin_rate_avg}rpm`)
        return parts.join(' · ')
      })
      prevDataText = `PREVIOUS SESSION (${previousSession.session_date}) — label any insight drawn from here as [Prev session]:\n${prevLines.join('\n')}`
    }

    // ── Prompt ──────────────────────────────────────────────────────────────
    const prompt = `You are Jordan, a professional golf performance analyst specialising in junior golfer development for UK boarding school scholarship pathways.

STUDENT: ${name}${age ? ', age ' + age : ''}${handicap ? ', handicap ' + handicap : ''}
GOAL: UK boarding school golf scholarship

SESSION: ${session.session_date} at ${session.location || 'practice facility'}
${session.session_notes || ''}

METRICS (averages per club):
${formattedClubData}
${flagSection}
${prevDataText}

BENCHMARKS (UK junior scholarship level, age 15-17):
- Driver: ball speed 140-155mph, smash factor 1.42-1.48, launch 12-15°, spin 2,200-2,800rpm
- 7-Iron: ball speed 100-115mph, carry 150-165yds, launch 18-22°
- PW: carry 100-120yds, spin 6,000-8,000rpm

RULES — follow every one without exception:

1. NEVER conclude "no data recorded" if any metrics exist. Metrics are present — analyse them. If some are inconsistent, say so and analyse the rest. Partial analysis with caveats is always better than silence.

2. DATA FLAGS must be addressed. For every INCONSISTENCY flag: explain the contradiction in plain English in data_quality_note and include it in cons. For every HIGH-SIGNAL flag (spin axis, face/path delta): include it in cons regardless of data confidence level.

3. DRILLS must be specific. Every drill description must cover three things — (a) Physical action: exactly what the student does with their body or club, (b) Feel cue: what they should feel or notice during the swing, (c) Metric target: which specific Trackman number this drill moves and in which direction. "Use the launch monitor correctly" is not acceptable.

4. PREVIOUS SESSION LABELLING. Any pros or cons drawn from previous session data must include "[Prev session]" at the start of the string. Never blend current and previous data into a single unlabelled statement.

5. LOW-CONFIDENCE STRUCTURE. When data has inconsistencies: data_quality_note explains what's wrong → overall_assessment leads with what CAN be inferred despite the data issues → pros draws on [Prev session] if current data is unreliable → cons always includes flagged high-signal metrics → drills target the flagged metrics.

Return ONLY valid JSON (no markdown, no code fences):
{
  "data_quality_note": "One sentence: what was captured, what is inconsistent and why, what confidence level. Use empty string if data is clean.",
  "pros": ["metric-backed string — prefix [Prev session] if drawn from previous data"],
  "cons": ["metric-backed string — always include spin axis and face/path delta if flagged"],
  "drills": [{"title":"","description":"(a) Physical action: ... (b) Feel cue: ... (c) Metric target: ..."}, {"title":"","description":"(a) Physical action: ... (b) Feel cue: ... (c) Metric target: ..."}, {"title":"","description":"(a) Physical action: ... (b) Feel cue: ... (c) Metric target: ..."}],
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
