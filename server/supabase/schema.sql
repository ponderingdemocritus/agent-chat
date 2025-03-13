-- Create users table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  username TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL REFERENCES public.users(id),
  recipient_id TEXT REFERENCES public.users(id),
  room_id TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure either recipient_id or room_id is set, but not both
  CONSTRAINT message_target_check CHECK (
    (recipient_id IS NULL AND room_id IS NOT NULL) OR
    (recipient_id IS NOT NULL AND room_id IS NULL)
  )
);

-- Create index for faster message retrieval
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON public.messages(sender_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- Create RLS (Row Level Security) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid "policy already exists" errors
DROP POLICY IF EXISTS "Allow public read access to users" ON public.users;
DROP POLICY IF EXISTS "Allow server to insert users" ON public.users;
DROP POLICY IF EXISTS "Allow server to update users" ON public.users;
DROP POLICY IF EXISTS "Allow users to update their own status" ON public.users;
DROP POLICY IF EXISTS "Allow server to read all messages" ON public.messages;
DROP POLICY IF EXISTS "Allow server to insert messages" ON public.messages;
DROP POLICY IF EXISTS "Allow authenticated users to read all messages" ON public.messages;
DROP POLICY IF EXISTS "Allow authenticated users to insert messages" ON public.messages;

-- Allow public access to users table (for online status)
CREATE POLICY "Allow public read access to users" 
  ON public.users FOR SELECT 
  USING (true);

-- Allow server to insert and update users (using anon key)
CREATE POLICY "Allow server to insert users" 
  ON public.users FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow server to update users" 
  ON public.users FOR UPDATE 
  USING (true);

-- Allow authenticated users to update their own status
-- This is kept for when you implement client-side auth
CREATE POLICY "Allow users to update their own status" 
  ON public.users FOR UPDATE 
  USING (auth.uid()::text = id);

-- Allow server to read all messages
CREATE POLICY "Allow server to read all messages" 
  ON public.messages FOR SELECT 
  USING (true);

-- Allow server to insert messages
CREATE POLICY "Allow server to insert messages" 
  ON public.messages FOR INSERT 
  WITH CHECK (true);

-- These policies are kept for when you implement client-side auth
-- Allow authenticated users to read all messages
CREATE POLICY "Allow authenticated users to read all messages" 
  ON public.messages FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert messages
CREATE POLICY "Allow authenticated users to insert messages" 
  ON public.messages FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid()::text = sender_id);

-- Check if realtime is already enabled for these tables
DO $$
BEGIN
  -- Try to enable realtime for users table
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  EXCEPTION
    WHEN duplicate_object THEN
      -- Table is already in the publication, which is fine
  END;
  
  -- Try to enable realtime for messages table
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION
    WHEN duplicate_object THEN
      -- Table is already in the publication, which is fine
  END;
END
$$; 