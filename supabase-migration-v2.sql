-- ── Migration v2: Parent contact, school card enrichment, timeline ─────────

-- Parent contact fields on students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;

-- Match/school info fields on student_schools
-- (copied from recommendations at move-to-applying time)
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS match_reasons JSONB DEFAULT '[]';
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS school_type TEXT;
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS sports JSONB DEFAULT '[]';
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS has_scholarship BOOLEAN DEFAULT false;
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS latest_update TEXT;
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS latest_update_at TIMESTAMPTZ;
ALTER TABLE student_schools ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '[]';

-- Timeline items table
CREATE TABLE IF NOT EXISTS school_timeline_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_school_id UUID REFERENCES student_schools(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  notes TEXT,
  item_type TEXT DEFAULT 'custom',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
