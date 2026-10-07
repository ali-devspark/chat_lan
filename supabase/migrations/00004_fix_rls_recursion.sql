-- Migration 00004: Fix RLS Infinite Recursion & Add Direct Conversation RPC

-- 1. SECURITY DEFINER function to check membership safely
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

-- 2. RPC function to safely create or get direct 1-on-1 conversation
CREATE OR REPLACE FUNCTION public.create_direct_conversation(target_user_id uuid)
RETURNS uuid AS $$
DECLARE
  existing_conv_id uuid;
  new_conv_id uuid;
BEGIN
  -- Check if direct conversation already exists
  SELECT cm1.conversation_id INTO existing_conv_id
  FROM public.conversation_members cm1
  JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
  JOIN public.conversations c ON c.id = cm1.conversation_id
  WHERE cm1.user_id = auth.uid()
    AND cm2.user_id = target_user_id
    AND COALESCE(c.is_group, false) = false
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  -- Create new conversation
  INSERT INTO public.conversations (is_group)
  VALUES (false)
  RETURNING id INTO new_conv_id;

  -- Add members
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES 
    (new_conv_id, auth.uid()),
    (new_conv_id, target_user_id);

  RETURN new_conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop all previous policies
DROP POLICY IF EXISTS "Users can view their conversations." ON public.conversations;
DROP POLICY IF EXISTS "Users can view members of their conversations." ON public.conversation_members;
DROP POLICY IF EXISTS "Users can view messages of their conversations." ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages to their conversations." ON public.messages;

DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view members of their conversations" ON public.conversation_members;
DROP POLICY IF EXISTS "Users can view messages of their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversation members" ON public.conversation_members;

-- 4. Create robust non-recursive policies

-- Conversations
CREATE POLICY "Users can view their conversations" ON public.conversations
  FOR SELECT USING (public.is_member_of_conversation(id, auth.uid()));

CREATE POLICY "Authenticated users can insert conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Conversation Members (check user_id = auth.uid() FIRST to avoid recursion on self-queries)
CREATE POLICY "Users can view members of their conversations" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_member_of_conversation(conversation_id, auth.uid())
  );

CREATE POLICY "Authenticated users can insert conversation members" ON public.conversation_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Messages
CREATE POLICY "Users can view messages" ON public.messages
  FOR SELECT USING (public.is_member_of_conversation(conversation_id, auth.uid()));

CREATE POLICY "Users can insert messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND public.is_member_of_conversation(conversation_id, auth.uid())
  );
