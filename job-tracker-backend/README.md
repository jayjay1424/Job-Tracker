# Job Tracker Backend

Node.js/Express backend for the Job Application Tracker.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```
   cp .env.example .env
   ```

2. Set a real `DATABASE_URL` (PostgreSQL connection string) and a strong `JWT_SECRET`.

3. Install dependencies:
   ```
   npm install
   ```

4. Run Prisma generate and migrate:
   ```
   npm run db:generate
   npm run db:migrate
   ```

5. Start the server:
   ```
   npm run dev
   ```

## API Endpoints

### Auth
- `POST /api/auth/signup` — register a new user
- `POST /api/auth/login` — login (returns JWT in cookie + body)
- `POST /api/auth/logout` — clear auth cookie
- `GET /api/auth/me` — get current authenticated user

### Applications
- `GET /api/applications` — list all applications (filtered by user)
- `POST /api/applications` — create a new application
- `GET /api/applications/:id` — get one application
- `PUT /api/applications/:id` — update an application
- `DELETE /api/applications/:id` — delete an application
- `PATCH /api/applications/:id/status` — change status (logs to StatusHistory)

### Reminders
- `GET /api/reminders` — list reminders for user
- `POST /api/reminders` — create a reminder tied to an application
- `PATCH /api/reminders/:id` — toggle completion
- `DELETE /api/reminders/:id` — delete a reminder

### Analytics
- `GET /api/analytics/dashboard` — summary stats + applications-per-week chart data
