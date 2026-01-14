# SahpathiAi Backend - Deployment Documentation

## Hosting

**Platform:** Vercel  
**Project:** neowebx  
**Region:** Mumbai (bom1) - Optimized for Indian users

---

## Quick Deploy

```bash
# Install Vercel CLI (if not installed)
npm i -g vercel

# Deploy to production
vercel --prod
```

---

## Environment Variables

Set these in **Vercel Dashboard → Project Settings → Environment Variables**:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `JWT_SECRET` | Secret for JWT tokens |
| `CLIENT_URL` | Frontend URL (e.g., `https://sahpathi.ai`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RAZORPAY_KEY_ID` | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret key |
| `RESEND_API_KEY` | Resend email API key |
| `REDIS_URL` | Redis connection URL (recommend Upstash) |
| `NODE_ENV` | Set to `production` |

---

## Performance Configuration

- **Memory:** 1024MB
- **Max Duration:** 30 seconds
- **Bundling:** ESBuild with minification
- **Caching:** Edge caching enabled for static endpoints

---

## API Endpoints

- **Health Check:** `GET /health`
- **All APIs:** `GET/POST /api/*`

---

## Local Development

```bash
npm run dev
```

Server runs on `http://localhost:3001`
