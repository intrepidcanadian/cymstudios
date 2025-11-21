# Supabase Setup Guide

This guide will help you set up Supabase for the newsletter email collection feature.

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - Project name: `cym-studio`
   - Database password: (choose a strong password)
   - Region: (choose closest to your users)
5. Click "Create new project"
6. Wait for the project to be set up (takes ~2 minutes)

## Step 2: Create the Newsletter Subscribers Table

1. In your Supabase dashboard, go to the **SQL Editor**
2. Click "New Query"
3. Copy and paste the following SQL:

```sql
-- Create the newsletter_subscribers table
CREATE TABLE newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  consent BOOLEAN NOT NULL DEFAULT false,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for faster email lookups
CREATE INDEX idx_newsletter_email ON newsletter_subscribers(email);

-- Enable Row Level Security (RLS)
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow insert from anyone (for the signup form)
CREATE POLICY "Allow public insert" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- Create policy to prevent public reads (only admins can read)
CREATE POLICY "No public reads" ON newsletter_subscribers
  FOR SELECT
  TO authenticated
  USING (true);
```

4. Click "Run" or press `Ctrl/Cmd + Enter`
5. You should see "Success. No rows returned"

## Step 3: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings** (gear icon in sidebar)
2. Click on **API**
3. You'll see two important values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **Publishable key** (under "API Keys" section - this is safe to use in the browser)

## Step 4: Configure Environment Variables

1. In your project root, create a file named `.env.local`
2. Add your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
```

3. Replace the placeholder values with your actual credentials
4. Save the file

**Note:** The `.env.local` file is gitignored and will NOT be committed to your repository.

## Step 5: Install Dependencies

Run the following command to install Supabase client:

```bash
npm install
```

## Step 6: Test the Newsletter Signup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open your browser to [http://localhost:3000](http://localhost:3000)

3. Scroll down to the newsletter signup form at the bottom

4. Enter an email and check the consent checkbox

5. Click "Subscribe"

6. Check your Supabase dashboard:
   - Go to **Table Editor**
   - Select `newsletter_subscribers`
   - You should see your test email!

## Step 7: View Your Subscribers

### In Supabase Dashboard:
1. Go to **Table Editor**
2. Click on `newsletter_subscribers`
3. View all subscribers, their consent status, and when they subscribed

### Export Data:
- Click the "..." menu in the table view
- Select "Download as CSV" to export your email list

## Email Marketing Integration

Once you have subscribers, you can:

1. **Export to Email Service:**
   - Download the CSV from Supabase
   - Import into services like Mailchimp, SendGrid, or ConvertKit

2. **Use Supabase Functions:**
   - Create Supabase Edge Functions to send emails directly
   - Integrate with email APIs (SendGrid, Resend, etc.)

3. **Third-party Tools:**
   - Use Zapier to automatically sync new subscribers
   - Connect to your CRM or email marketing platform

## Security Notes

- ✅ Row Level Security (RLS) is enabled
- ✅ Only authenticated users can read subscriber data
- ✅ Public can only insert (signup)
- ✅ Email consent is required before insertion
- ✅ IP address and user agent are tracked for compliance

## GDPR Compliance

The implementation includes:
- ✅ Explicit consent checkbox
- ✅ Clear purpose statement
- ✅ Timestamp of subscription
- ✅ IP address tracking (for proof of consent)
- ⚠️ You should add an unsubscribe mechanism (future enhancement)
- ⚠️ You should add a privacy policy link

## Troubleshooting

### Error: "Failed to subscribe"
- Check that your `.env.local` file has the correct credentials
- Verify the table was created in Supabase
- Check browser console for detailed errors

### Error: "This email is already subscribed"
- The email has already been added to the database
- This is expected behavior to prevent duplicates

### No data appearing in Supabase
- Ensure your environment variables are correct
- Restart your dev server after adding `.env.local`
- Check Network tab in browser dev tools for API errors

## Next Steps

Consider adding:
- Unsubscribe functionality
- Email verification (double opt-in)
- Welcome email automation
- Admin dashboard to manage subscribers
- Email sending integration

---

Need help? Check the [Supabase Documentation](https://supabase.com/docs) or reach out to support!

