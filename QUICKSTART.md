# Quick Start Guide

Get your CYM Studio website up and running in 5 minutes!

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Supabase (Required for Newsletter)

### Option A: Quick Setup
1. Go to [supabase.com](https://supabase.com) and create a project
2. Run this SQL in your Supabase SQL Editor:

```sql
CREATE TABLE newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT false,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert" ON newsletter_subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "No public reads" ON newsletter_subscribers
  FOR SELECT TO authenticated USING (true);
```

3. Get your credentials from Settings → API
4. Create `.env.local` file:

```bash
cp env.example .env.local
```

5. Edit `.env.local` and add your credentials

### Option B: Detailed Setup
See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for step-by-step instructions.

## 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

## 4. Test Everything

- ✅ Use arrow keys to navigate the circular spaceship layout
- ✅ Walk toward any of the 4 TVs - videos open automatically
- ✅ Click the Menu button to view sidebar sections
- ✅ Test the newsletter signup form at the bottom
- ✅ Check Supabase to see the submitted email

## 5. Deploy to Production

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Deploy! 🚀

---

**Need help?** Check [README.md](./README.md) or [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

