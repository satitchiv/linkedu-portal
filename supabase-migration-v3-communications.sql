-- Migration v3: School Communications
-- Run in Supabase SQL Editor
-- Pre-flight: SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles';

CREATE TABLE IF NOT EXISTS school_communications (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_school_id UUID REFERENCES student_schools(id) ON DELETE SET NULL,
  school_name       TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  subject           TEXT,
  body_text         TEXT NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visible_to_parent BOOLEAN NOT NULL DEFAULT false,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_communications_student_sent
  ON school_communications (student_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_school_communications_visible
  ON school_communications (student_id, visible_to_parent, sent_at DESC);

ALTER TABLE school_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analyst_all_communications"
  ON school_communications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('analyst', 'admin')
    )
  );

CREATE POLICY "parent_read_visible_communications"
  ON school_communications FOR SELECT
  USING (visible_to_parent = true);

CREATE TRIGGER set_updated_at_communications
  BEFORE UPDATE ON school_communications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
