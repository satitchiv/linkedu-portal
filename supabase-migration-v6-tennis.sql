-- v6: Tennis Tab
-- Adds 5 tables for player profile, match diary, tournament calendar, ranking tracker, and development notes.
-- Adds show_tennis_to_parent toggle on students table.
-- Run on Supabase project: linkedu-parent-portal (ufspivvuevllmkxmivbe)

-- ── Tennis player profile (one per student) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tennis_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  dominant_hand TEXT CHECK (dominant_hand IN ('right', 'left', 'ambidextrous')),
  backhand_style TEXT CHECK (backhand_style IN ('one-handed', 'two-handed')),
  current_coach TEXT,
  current_academy TEXT,
  training_hours_per_week NUMERIC,
  years_playing NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id)
);

-- ── Match diary ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tennis_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  match_date DATE NOT NULL,
  tournament_name TEXT NOT NULL,
  opponent_name TEXT,
  score TEXT NOT NULL,
  result TEXT CHECK (result IN ('win', 'loss')) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_matches_student ON tennis_matches(student_id);
CREATE INDEX IF NOT EXISTS idx_tennis_matches_date ON tennis_matches(match_date);

-- ── Tournament calendar ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tennis_tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  tournament_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  category TEXT,
  status TEXT CHECK (status IN ('planning', 'entered', 'confirmed', 'completed', 'withdrawn')) DEFAULT 'planning',
  result TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_tournaments_student ON tennis_tournaments(student_id);
CREATE INDEX IF NOT EXISTS idx_tennis_tournaments_date ON tennis_tournaments(start_date);

-- ── Ranking tracker (one entry per month) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS tennis_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  ranking_type TEXT NOT NULL,
  ranking_value NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_rankings_student ON tennis_rankings(student_id);
CREATE INDEX IF NOT EXISTS idx_tennis_rankings_date ON tennis_rankings(log_date);

-- ── Development notes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tennis_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  note_date DATE NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tennis_notes_student ON tennis_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_tennis_notes_date ON tennis_notes(note_date);

-- ── Tab visibility toggle ──────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS show_tennis_to_parent BOOLEAN NOT NULL DEFAULT false;

-- ── RLS policies ──────────────────────────────────────────────────────────────
-- Note: All tennis Netlify functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- These policies are a safety net for any direct client-side Supabase calls.

ALTER TABLE tennis_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_notes ENABLE ROW LEVEL SECURITY;

-- tennis_profiles
CREATE POLICY "Analysts can manage tennis_profiles"
  ON tennis_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')));

CREATE POLICY "Parents can read own tennis_profiles"
  ON tennis_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_profiles.student_id));

-- tennis_matches
CREATE POLICY "Analysts can manage tennis_matches"
  ON tennis_matches FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')));

CREATE POLICY "Parents can read own tennis_matches"
  ON tennis_matches FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_matches.student_id));

CREATE POLICY "Parents can insert own tennis_matches"
  ON tennis_matches FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_matches.student_id));

-- tennis_tournaments
CREATE POLICY "Analysts can manage tennis_tournaments"
  ON tennis_tournaments FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')));

CREATE POLICY "Parents can read own tennis_tournaments"
  ON tennis_tournaments FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_tournaments.student_id));

CREATE POLICY "Parents can insert own tennis_tournaments"
  ON tennis_tournaments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_tournaments.student_id));

-- tennis_rankings
CREATE POLICY "Analysts can manage tennis_rankings"
  ON tennis_rankings FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')));

CREATE POLICY "Parents can read own tennis_rankings"
  ON tennis_rankings FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_rankings.student_id));

CREATE POLICY "Parents can insert own tennis_rankings"
  ON tennis_rankings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_rankings.student_id));

-- tennis_notes
CREATE POLICY "Analysts can manage tennis_notes"
  ON tennis_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('analyst', 'admin')));

CREATE POLICY "Parents can read own tennis_notes"
  ON tennis_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_notes.student_id));

CREATE POLICY "Parents can insert own tennis_notes"
  ON tennis_notes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND student_id = tennis_notes.student_id));
