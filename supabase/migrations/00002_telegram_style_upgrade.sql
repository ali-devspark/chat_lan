-- Migration 00002: Telegram-style unique usernames, auto-profile creation trigger, and message enhancements

-- 1. Ensure usernames are unique (like Telegram @username)
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_username_key UNIQUE (username);

-- 2. Create automatic trigger to create profile when user registers via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://avatar.vercel.sh/' || new.id),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Add message metadata for future expansion (message types & read receipts)
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
