-- Migration 00007: Add is_edited column to public.messages

ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false;
