-- Migration 00006: Add display_name to profiles and fix message update RLS for read receipts

-- 1. Add display_name column to public.profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS display_name text;

-- Update existing profiles display_name to username if null
UPDATE public.profiles 
SET display_name = username 
WHERE display_name IS NULL;

-- 2. Update handle_new_user trigger to save display_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_username text;
  user_display text;
BEGIN
  user_username := COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  user_display := COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', user_username);

  INSERT INTO public.profiles (id, username, display_name, avatar_url, updated_at)
  VALUES (
    new.id,
    user_username,
    user_display,
    COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://avatar.vercel.sh/' || new.id),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix Messages UPDATE policy so recipients/members can update is_read status
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages in their conversations" ON public.messages;

CREATE POLICY "Users can update messages in their conversations" ON public.messages
  FOR UPDATE USING (
    public.is_member_of_conversation(conversation_id, auth.uid())
  );
