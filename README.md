# YE2K

Professional beat storefront and Supabase-powered back office.

## 1. Install

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 2. Supabase setup

1. Supabase Dashboard → SQL Editor → New Query.
2. Paste `supabase/schema.sql`.
3. Run it.
4. Supabase Dashboard → Storage → New Bucket.
5. Create:
   - `beat-covers` — public
   - `beat-previews` — public
   - `beat-files` — private
6. Supabase Dashboard → Authentication → Users → Add user.
7. Copy that user's UUID.
8. Run the final commented admin-profile SQL in `supabase/schema.sql` with the UUID.

## 3. Environment variables

Add all variables from `.env.example` locally and in:

Vercel Dashboard → Project → Settings → Environment Variables

Never commit `SUPABASE_SECRET_KEY` or `STRIPE_SECRET_KEY`.

## 4. GitHub and Vercel

1. Create an empty GitHub repository.
2. Push this project.
3. Vercel Dashboard → Add New → Project.
4. Import the GitHub repository.
5. Add environment variables.
6. Deploy.

## Notes

- Back-office uploads go directly from the authenticated browser to Supabase Storage under RLS.
- Public artwork and preview audio use public buckets.
- Master MP3/WAV files stay in the private `beat-files` bucket.
- Stripe Checkout totals are recalculated from Supabase on the server.
- The storefront displays polished demo content until published Supabase beats exist.


## Required schema update for simplified catalog

Run `supabase/remove-unused-beat-metadata.sql` in Supabase SQL Editor before uploading new beats. It makes genre and BPM optional without deleting existing data.
