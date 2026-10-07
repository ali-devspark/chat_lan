-- Migration 00003: Row Level Security Policies for inserting conversations and members

-- 1. Enable authenticated users to create new conversations
CREATE POLICY "Authenticated users can insert conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Enable authenticated users to add members to conversations
CREATE POLICY "Authenticated users can insert conversation members" ON public.conversation_members
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
