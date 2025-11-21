# Supabase New API Keys - Migration Guide

Supabase has updated their API key system. Here's what changed and how to update.

## What Changed?

**Old System:**
- `SUPABASE_ANON_KEY` (public)

**New System:**
- `Publishable key` (public, safe for browser)
- `Secret keys` (backend only, not used in this project)

## How to Update Your Project

### 1. Get Your New Publishable Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Look for **"Publishable key"** under the "API Keys" section
5. Copy the key that starts with `sb_publishable_...`

### 2. Update Your `.env.local` File

Open your `.env.local` file and update it:

**Old format:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

**New format:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

### 3. Restart Your Dev Server

```bash
# Stop your current server (Ctrl+C)
npm run dev
```

## Note on Backward Compatibility

The code has been updated to support BOTH the old and new key names, so if you have the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your `.env.local`, it will still work while you transition.

## Still Getting the RLS Error?

The Row Level Security error is **NOT** related to the API key naming. You need to run this SQL in your Supabase SQL Editor:

```sql
DROP POLICY IF EXISTS "Allow public insert" ON newsletter_subscribers;

CREATE POLICY "Allow public insert" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);
```

This allows the publishable key to insert records into your database.

---

**Questions?** Check the [Supabase documentation](https://supabase.com/docs) or the main [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) file.

