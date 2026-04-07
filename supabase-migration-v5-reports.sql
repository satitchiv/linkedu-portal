-- v5: School Reports tab
-- Adds toggle for showing the Reports tab to parents + analyst notes per recommendation

ALTER TABLE students ADD COLUMN IF NOT EXISTS show_reports_to_parent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE student_recommendations ADD COLUMN IF NOT EXISTS analyst_notes TEXT;
