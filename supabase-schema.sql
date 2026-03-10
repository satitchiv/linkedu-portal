-- ============================================================
-- LinkedU Parent Portal — Supabase Schema
-- Run this in Supabase SQL Editor (in order)
-- ============================================================

-- ============================================================
-- 1. USER PROFILES
-- Links a Supabase Auth user to their Notion student record
-- ============================================================
CREATE TABLE public.user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notion_student_id TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'analyst')),
  student_name    TEXT,
  parent_name     TEXT,
  email           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. GOLF ROUNDS
-- Replaces golf_rounds.json — full hole-by-hole data
-- ============================================================
CREATE TABLE public.golf_rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_student_id TEXT NOT NULL,
  date            DATE NOT NULL,
  course          TEXT NOT NULL,
  tees            TEXT,
  round_type      TEXT,
  weather         TEXT,
  conditions      TEXT,
  scorecard_photo TEXT,
  holes           JSONB NOT NULL DEFAULT '[]',
  round_voice_memo TEXT,
  coach_recommendation TEXT,
  debrief         TEXT,
  entered_by_role TEXT DEFAULT 'analyst' CHECK (entered_by_role IN ('analyst', 'parent')),
  entered_by_id   UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. PARENT UPDATES
-- Flexible table — any tab, any section, any future editable field
-- Section examples: 'profile', 'goals', 'academics', 'schools', 'notes'
-- ============================================================
CREATE TABLE public.parent_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_student_id TEXT NOT NULL,
  section         TEXT NOT NULL,
  field_key       TEXT NOT NULL,
  field_value     JSONB NOT NULL,
  updated_by      UUID REFERENCES auth.users(id),
  updated_by_role TEXT CHECK (updated_by_role IN ('parent', 'analyst')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (notion_student_id, section, field_key)
);

-- ============================================================
-- 4. DOCUMENT SUBMISSIONS
-- Supplements Notion documents — parent-submitted links
-- ============================================================
CREATE TABLE public.document_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_student_id TEXT NOT NULL,
  doc_title       TEXT NOT NULL,
  doc_link        TEXT,
  doc_notes       TEXT,
  doc_type        TEXT,
  status          TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'verified', 'rejected')),
  submitted_by    UUID REFERENCES auth.users(id),
  reviewed_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. ANALYST SESSIONS (audit log)
-- Tracks when analysts access or edit student data
-- ============================================================
CREATE TABLE public.analyst_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id      UUID REFERENCES auth.users(id),
  notion_student_id TEXT,
  action          TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY — Enable on all tables
-- ============================================================
ALTER TABLE public.user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_rounds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_updates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyst_sessions     ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — user_profiles
-- ============================================================
-- Parents can only read their own profile
CREATE POLICY "parent_read_own_profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Analysts can read all profiles
CREATE POLICY "analyst_read_all_profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Users can update their own profile
CREATE POLICY "user_update_own_profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Service role can insert (used when inviting parents)
CREATE POLICY "service_insert_profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- RLS POLICIES — golf_rounds
-- ============================================================
-- Parents can only read rounds for their student
CREATE POLICY "parent_read_own_rounds"
  ON public.golf_rounds FOR SELECT
  USING (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Analysts can read all rounds
CREATE POLICY "analyst_read_all_rounds"
  ON public.golf_rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Parents can insert their own practice rounds
CREATE POLICY "parent_insert_own_rounds"
  ON public.golf_rounds FOR INSERT
  WITH CHECK (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Analysts can insert rounds for any student
CREATE POLICY "analyst_insert_rounds"
  ON public.golf_rounds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Analysts can update any round
CREATE POLICY "analyst_update_rounds"
  ON public.golf_rounds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- ============================================================
-- RLS POLICIES — parent_updates
-- ============================================================
-- Parents can read their own updates
CREATE POLICY "parent_read_own_updates"
  ON public.parent_updates FOR SELECT
  USING (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Analysts can read all updates
CREATE POLICY "analyst_read_all_updates"
  ON public.parent_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Parents can insert/update their own section data
CREATE POLICY "parent_upsert_own_updates"
  ON public.parent_updates FOR INSERT
  WITH CHECK (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "parent_update_own_updates"
  ON public.parent_updates FOR UPDATE
  USING (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Analysts can insert/update any student updates
CREATE POLICY "analyst_upsert_updates"
  ON public.parent_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

CREATE POLICY "analyst_update_updates"
  ON public.parent_updates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- ============================================================
-- RLS POLICIES — document_submissions
-- ============================================================
CREATE POLICY "parent_read_own_docs"
  ON public.document_submissions FOR SELECT
  USING (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "analyst_read_all_docs"
  ON public.document_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

CREATE POLICY "parent_insert_own_docs"
  ON public.document_submissions FOR INSERT
  WITH CHECK (
    notion_student_id = (
      SELECT notion_student_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "analyst_manage_docs"
  ON public.document_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- ============================================================
-- RLS POLICIES — analyst_sessions
-- ============================================================
CREATE POLICY "analyst_manage_sessions"
  ON public.analyst_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- ============================================================
-- UPDATED_AT TRIGGER (auto-updates timestamp on row change)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_golf_rounds
  BEFORE UPDATE ON public.golf_rounds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_parent_updates
  BEFORE UPDATE ON public.parent_updates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_document_submissions
  BEFORE UPDATE ON public.document_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
