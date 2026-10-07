-- Create profiles table
CREATE TABLE public.profiles (
  id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  username text,
  avatar_url text,
  updated_at timestamp with time zone,
  PRIMARY KEY (id)
);

-- Create conversations table
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  is_group boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Create conversation members table
CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  joined_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (id)
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile." ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile." ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Helper function to check membership safely without RLS infinite recursion
CREATE OR REPLACE FUNCTION public.is_member_of_conversation(_conversation_id uuid, _user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conversation_id
    AND user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Conversations Policies
CREATE POLICY "Users can view their conversations." ON public.conversations
  FOR SELECT USING (public.is_member_of_conversation(id, auth.uid()));

CREATE POLICY "Authenticated users can insert conversations." ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Conversation Members Policies
CREATE POLICY "Users can view members of their conversations." ON public.conversation_members
  FOR SELECT USING (public.is_member_of_conversation(conversation_id, auth.uid()));

CREATE POLICY "Authenticated users can insert conversation members." ON public.conversation_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Messages Policies
CREATE POLICY "Users can view messages of their conversations." ON public.messages
  FOR SELECT USING (public.is_member_of_conversation(conversation_id, auth.uid()));

CREATE POLICY "Users can insert messages to their conversations." ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND public.is_member_of_conversation(conversation_id, auth.uid())
  );

-- Triggers for Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
