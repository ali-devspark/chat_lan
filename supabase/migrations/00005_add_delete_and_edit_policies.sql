-- Migration 00005: Add Delete & Edit RLS Policies for Conversations and Messages

-- 1. Messages UPDATE policy (users can edit their own messages)
CREATE POLICY "Users can update their own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- 2. Messages DELETE policy (users can delete their own messages)
CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- 3. Conversation Members DELETE policy (users can leave or delete conversation membership)
CREATE POLICY "Users can delete conversation members" ON public.conversation_members
  FOR DELETE USING (
    user_id = auth.uid() OR public.is_member_of_conversation(conversation_id, auth.uid())
  );

-- 4. Conversations DELETE policy (members can delete conversations)
CREATE POLICY "Users can delete conversations" ON public.conversations
  FOR DELETE USING (public.is_member_of_conversation(id, auth.uid()));
