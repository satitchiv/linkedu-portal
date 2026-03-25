-- Add account_type to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'client'
CHECK (account_type IN ('free', 'client'));

-- Update existing rows to 'client'
UPDATE public.user_profiles SET account_type = 'client' WHERE account_type IS NULL;

-- Create saved_tool_results table
CREATE TABLE IF NOT EXISTS public.saved_tool_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_label TEXT,
  result_summary TEXT,
  result_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tool_name)
);

-- Enable RLS
ALTER TABLE public.saved_tool_results ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can read own results" ON public.saved_tool_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own results" ON public.saved_tool_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own results" ON public.saved_tool_results
  FOR UPDATE USING (auth.uid() = user_id);
