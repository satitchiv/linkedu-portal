-- Migration v4: Trackman Performance Sessions
-- Run via Supabase MCP execute_sql

CREATE TABLE IF NOT EXISTS golf_trackman_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid REFERENCES students(id) ON DELETE CASCADE,
  notion_student_id text,
  session_date      date NOT NULL,
  session_notes     text,
  location          text,
  entered_by_id     uuid,
  entered_by_role   text,
  club_data         jsonb NOT NULL DEFAULT '[]',
  -- club_data shape: [{
  --   club, shots,
  --   ball_speed_avg, launch_angle_avg, launch_direction_avg,
  --   spin_rate_avg, spin_axis_avg,
  --   carry_distance_avg, total_distance_avg, side_distance_avg,
  --   smash_factor_avg,
  --   club_speed_avg, face_angle_avg, club_path_avg,
  --   attack_angle_avg, dynamic_loft_avg
  -- }]
  ai_analysis       jsonb,
  -- ai_analysis shape: {
  --   pros[], cons[], drills[{title, description}],
  --   overall_assessment, benchmark_context,
  --   vs_last_session: { improved[], regressed[] },
  --   generated_at
  -- }
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_golf_trackman_student
  ON golf_trackman_sessions(student_id);

CREATE INDEX IF NOT EXISTS idx_golf_trackman_date
  ON golf_trackman_sessions(student_id, session_date DESC);

-- RLS
ALTER TABLE golf_trackman_sessions ENABLE ROW LEVEL SECURITY;

-- Analysts can read and write all sessions
CREATE POLICY "Analysts can manage trackman sessions"
  ON golf_trackman_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('analyst', 'admin')
    )
  );

-- Parents can read their own student's sessions
CREATE POLICY "Parents can read own student trackman sessions"
  ON golf_trackman_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND student_id = golf_trackman_sessions.student_id
    )
  );
