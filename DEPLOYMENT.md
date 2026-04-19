# 🚀 Deploying CYM Studio to Vercel

This guide will walk you through deploying your CYM Studio spaceship to production on Vercel.

## Prerequisites

- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (you can sign up with GitHub)

## Step 1: Push to GitHub

### Option A: Using GitHub Desktop (Easiest)
1. Download and install [GitHub Desktop](https://desktop.github.com)
2. Open GitHub Desktop
3. Click **File → Add Local Repository**
4. Select `/Users/tony/Documents/cymstudio`
5. Click **Publish repository** button
6. Choose a name: `cymstudio`
7. Uncheck "Keep this code private" if you want it public
8. Click **Publish repository**

### Option B: Using Terminal
```bash
# Create a new repository on GitHub first at https://github.com/new
# Then run these commands:

cd /Users/tony/Documents/cymstudio

# Add your GitHub repository as remote
git remote add origin https://github.com/YOUR_USERNAME/cymstudio.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Vercel

### Easy Deployment (Recommended)

1. Go to [vercel.com](https://vercel.com)
2. Click **Sign Up** or **Log In** (use GitHub account)
3. Click **Add New... → Project**
4. Import your `cymstudio` repository
5. Vercel will auto-detect it's a Next.js project
6. Click **Deploy**

That's it! Vercel will:
- Build your project
- Deploy it to a production URL
- Give you a live link like: `cymstudio.vercel.app`

### Configuration Settings

**Framework Preset:** Next.js (auto-detected)  
**Build Command:** `npm run build` (auto-detected)  
**Output Directory:** `.next` (auto-detected)  
**Install Command:** `npm install` (auto-detected)

## Step 3: Add Environment Variables (Optional)

If you want to use the newsletter feature with Supabase:

1. In Vercel dashboard, go to your project
2. Click **Settings**
3. Click **Environment Variables**
4. Add these variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your-supabase-url
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your-publishable-key
5. Click **Save**
6. Redeploy your project

## Step 4: Custom Domain (Optional)

1. In Vercel dashboard, click **Settings → Domains**
2. Enter your custom domain (e.g., `cymstudio.com`)
3. Follow Vercel's DNS configuration instructions
4. Wait for DNS propagation (usually 10-60 minutes)

## Automatic Deployments

Every time you push to GitHub, Vercel will automatically:
- Build and deploy your changes
- Create a preview URL for each branch
- Keep your production site updated

## Troubleshooting

### Build Fails
- Check the build logs in Vercel dashboard
- Make sure all dependencies are in `package.json`
- Test build locally: `npm run build`

### Environment Variables Not Working
- Make sure variable names start with `NEXT_PUBLIC_`
- Redeploy after adding environment variables
- Check spelling and values

### Images Not Loading
- All images must be in the `public` folder
- Reference as `/image.png` not `public/image.png`

## Your Project URLs

After deployment, you'll get:
- **Production:** `https://cymstudio.vercel.app`
- **Preview:** Unique URL for each git branch
- **Deployments:** View all at `vercel.com/dashboard`

## Performance Optimization

Vercel automatically provides:
- ✅ Global CDN
- ✅ Automatic HTTPS
- ✅ Edge caching
- ✅ Image optimization
- ✅ Instant cache invalidation

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- Contact: tony.lau@pulse520.ai

---

**Ready to deploy?** Just follow Step 1 and Step 2 above! 🚀

