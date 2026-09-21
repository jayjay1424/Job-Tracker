# Deploy Job Tracker — ONE App (Single Vercel Project)

This repo is a monorepo: `job-tracker-frontend/` (Vite) + `job-tracker-backend/` (Express + Prisma). For **ONE** deployment, the backend serves the frontend (`src/index.js:26` `express.static`).

## 1. GitHub
Already pushed: `https://github.com/jayjay1424/Job-Tracker` branch `main`.

## 2. Vercel — Single Project (ONE)

### A. Create Project
1. Vercel Dashboard → Add New → Project → Import `jayjay1424/Job-Tracker`.
2. **Root Directory:** leave empty (repo root — uses `/vercel.json` at root).
   - If Vercel asks, set Framework to `Other`.
3. Vercel will use `vercel.json`:
   - `buildCommand` builds frontend (`job-tracker-frontend/dist`) then `prisma generate` for backend.
   - `rewrites` send `/api/*` and all other routes to `job-tracker-backend/api/index.js` (serverless wrapper around Express `src/index.js`).

### B. Environment Variables (Vercel Dashboard → Settings → Environment Variables)
Add these for **Production**:

```
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"
  # Get from Neon (neon.tech) or Vercel Postgres or Supabase.
  # Local .env uses sqlite file:./dev.db — for production you MUST use postgresql.

JWT_SECRET="replace-with-32+char-random-string-use-openssl-rand-hex-32"
JWT_EXPIRES_IN=7d
CLIENT_URL=https://<your-app>.vercel.app  # exact URL Vercel gives you after first deploy
NODE_ENV=production
# Optional AI:
# AI_API_KEY=...
# AI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=gpt-4o-mini
```

**Important:** Generate `JWT_SECRET`:
```
openssl rand -hex 32
# or: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### C. Database Migration (Postgres)
Local `prisma/schema.prisma:8` is currently `sqlite` for easy dev. For production you need `postgresql`:

1. In `prisma/schema.prisma` change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
   (Same for `src/prisma/schema.prisma` — keep them synced.)
2. Commit and push, then Vercel Build will run `npx prisma migrate deploy`.
   - Alternatively, provision Vercel Postgres from dashboard — it auto-sets `DATABASE_URL` and runs migrate if you add `vercel-build` script.

**For quick demo without Postgres:** Keep `sqlite` provider — Vercel will boot but data will be **ephemeral** (wiped on each deploy). For real use by everyone, you MUST use Postgres.

### D. Deploy
- Push to `main` already done (`a3c339d`). Vercel auto-deploys on push.
- After first deploy, copy the Vercel URL (e.g., `https://job-tracker.vercel.app`) and set it as `CLIENT_URL` env, then redeploy.

### E. Verify
- `https://<app>.vercel.app/api/health` → `{"status":"ok"}`
- `https://<app>.vercel.app/board` → Board (login required → redirect to `/login`)
- Signup new user, create application in `Applied`, check `Analytics` and `Reminders` — data should persist after redeploy (if Postgres).

## 3. Local Dev (still SQLite)
```bash
cd job-tracker-backend
npm run db:generate
npm run db:push  # or db:migrate
npm run dev      # http://localhost:4000
# frontend served at same origin: http://localhost:4000/board
```

## 4. Troubleshooting
- **CORS error:** Ensure `CLIENT_URL` matches frontend Vercel URL exactly (no trailing slash).
- **Prisma P1001 Can't reach DB:** `DATABASE_URL` wrong or not set in Vercel env.
- **401 after login:** Check `JWT_SECRET` set in Vercel, cookie `secure` requires `https` (production).
- **Empty board but data exists locally:** Local `dev.db` not pushed (gitignored) — expected. Production data lives in Postgres, not local.
