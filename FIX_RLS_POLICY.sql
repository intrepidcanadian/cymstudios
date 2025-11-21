-- Fix for Row Level Security Policy Error
-- Run this SQL in your Supabase SQL Editor

-- First, drop the existing policy if it exists
DROP POLICY IF EXISTS "Allow public insert" ON newsletter_subscribers;

-- Create the correct policy that allows anonymous inserts
CREATE POLICY "Allow public insert" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- Verify the policy was created
SELECT * FROM pg_policies WHERE tablename = 'newsletter_subscribers';

