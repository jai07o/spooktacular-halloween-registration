# Spooktacular Halloween Party 2026 - Registration Platform

A production-ready full-stack event registration web application with real-time dynamic pricing, UPI payment workflow with duplicate-proof UTR verification, dynamic ticket generation with QR validation, a floating continuous Halloween music player, and a secure admin dashboard featuring automated duplicate detection and safe reconciliation.

Deployed seamlessly to **Vercel** with a Vite React frontend (`client/dist`) and high-performance serverless Express API (`api/index.js`), backed by **Supabase PostgreSQL**. Engineered for high throughput to support **10,000+ concurrent visitors and registrations** without crashes or latency.

---

## 🎃 Event Overview

- **Event Name:** SPOOKTACULAR HALLOWEEN PARTY 2026
- **Tagline:** *"Join Us for a Spooktacular Night • Spooky Vibes, Good Times"*
- **Date & Time:** 31 October 2026, 6:00 PM onwards
- **Venue:** MKV Convention, PSCMR College of Engineering and Technology, College Street, Fish Market Area, Vijayawada, Andhra Pradesh, India
- **Official UPI Payee:** `mohith.deepu@ybl`
- **Highlights:** DJ Night, Costume Contest, Spooky Fun & Games, Photo Booth, Spooky Refreshments & Food

---

## ⚡ Core Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │                  VERCEL                     │
                    │                                             │
                    │  ┌──────────────────────────────────────┐   │
                    │  │  Vercel Edge CDN (Static Frontend)   │   │
                    │  │  Public:  /(.*)                      │   │
                    │  │  Static SPA — HTML, CSS, JS, Media   │   │
                    │  └────────────────────┬─────────────────┘   │
                    │                  Browser /api/* requests    │
                    │     ┌──────────────────▼────────────────┐   │
                    │     │  Vercel Edge Rewrites             │   │
                    │     │  /api/(.*) → /api/index.js        │   │
                    │     └──────────────────┬────────────────┘   │
                    │  ┌────────────────────▼──────────────────┐  │
                    │  │  Vercel Serverless Function           │  │
                    │  │  Express API (api/index.js)           │  │
                    │  │  - Stateless JWT Auth & Rate Limiting │  │
                    │  │  - Edge-cached Pricing                │  │
                    │  │  - Collision-proof Ticket Generation  │  │
                    │  │  - Atomic Approvals & XLSX export     │  │
                    │  └────────────────────┬──────────────────┘  │
                    └───────────────────────┼─────────────────────┘
                                            │ Service Role (Bypasses RLS)
                                            │ HTTPS / Connection Pooling
                    ┌───────────────────────▼─────────────────────┐
                    │                   SUPABASE                  │
                    │                                             │
                    │  - PostgreSQL Database Cluster              │
                    │  - Row Level Security (RLS) on all tables   │
                    │    (admin_users, registrations,             │
                    │     payment_sessions, submissions,          │
                    │     tickets, admin_audit_log)               │
                    │  - Stored Procedures:                       │
                    │    * approve_payment_submission()           │
                    │    * resolve_duplicate_registration()       │
                    │    * get_dashboard_statistics()             │
                    │    * scan_duplicate_records()               │
                    │  - Optimized Composite Indexes & Sequences  │
                    └─────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

- **Frontend:** React 18, Vite, React Router v6, Canvas Confetti, HTML5 Audio API, Vanilla CSS.
- **Hosting:** Vercel — Edge CDN (Vite SPA) + Serverless Function API (`/api`).
- **Routing:** Vercel edge rewrites — `/api/(.*) → /api/index.js`; `/(.*) → /index.html`.
- **Database:** Supabase PostgreSQL with Row Level Security (RLS) & Atomic Stored Procedures.
- **Authentication:** Stateless JWT stored in `httpOnly`, `secure`, `sameSite: lax` cookies with Bearer header fallback.
- **Local Dev:** `npm run dev` (Vite proxy → Express on :3001) or standalone.
- **Local Fallback DB:** Better-SQLite3 for instant offline development and unit tests.
- **Testing:** Jest, Supertest (28 automated integration tests).
- **Reporting:** Genuine `.xlsx` binary workbook generation using SheetJS.

---

## 📖 Complete Deployment Guide (Vercel + Supabase)

Follow these step-by-step instructions to deploy the application to production.

---

### Step 1: Create a Supabase Project

1. Navigate to [https://supabase.com](https://supabase.com) and log in or create an account.
2. Click **"New Project"**.
3. Choose your organization, set the project name (e.g. `spooktacular-halloween-2026`), set a secure database password, and select the region closest to your audience (e.g., `ap-south-1` Mumbai for India).
4. Wait for the project initialization to complete (typically ~1-2 minutes).
5. Once created, go to **Project Settings** (gear icon) -> **API**:
   - Copy **Project URL** (`https://<project-id>.supabase.co`).
   - Copy **anon / public key**.
   - Copy **service_role key** (keep this secret; never reveal in client-side code).

---

### Step 2: Run the SQL Migrations

1. In your Supabase dashboard, click **SQL Editor** from the left navigation.
2. Click **"New query"**.
3. Open the file [`supabase/migrations/20261023000000_create_spooktacular_schema.sql`](supabase/migrations/20261023000000_create_spooktacular_schema.sql) (or [`supabase/schema.sql`](supabase/schema.sql)) from this repository.
4. Paste the entire SQL content into the Supabase SQL editor.
5. Click **"Run"** (or press Ctrl+Enter).
6. Verify in the output that all tables, indexes, stored procedures, and RLS policies are created successfully:
   - `admin_users`
   - `registrations`
   - `payment_sessions`
   - `payment_submissions`
   - `tickets`
   - `admin_audit_log`
   - Functions: `approve_payment_submission`, `resolve_duplicate_registration`, `get_dashboard_statistics`

---

### Step 3: Configure Supabase RLS and Admin Access

1. **Row Level Security (RLS)** is enabled on all tables automatically by the migration script.
2. Confirm policies in Supabase under **Authentication** -> **Policies**:
   - `admin_users`: Public access disabled (`USING (false)`).
   - `admin_audit_log`: Public access disabled (`USING (false)`).
   - `payment_submissions`: Public access disabled (`USING (false)`).
   - `payment_sessions`: Public can only read active non-expired sessions.
   - `registrations`: Public can create registrations and read by access token.
   - `tickets`: Public can only validate valid tickets.
3. The serverless backend communicates with Supabase using `SUPABASE_SERVICE_ROLE_KEY`, which safely bypasses RLS on the server side to perform authorized admin operations and ticket issuance.
4. The migration script seeds a default admin account with username `admin`. When launching the server with your custom `ADMIN_PASSWORD` in environment variables, the server will automatically bootstrap your preferred password hash.

---

### Step 4: Connect the GitHub Repository to Vercel

1. Push your repository to GitHub:
   ```bash
   git push origin main
   ```
2. Navigate to [https://vercel.com](https://vercel.com) and log in.
3. Click **"Add New..."** -> **"Project"**.
4. Select your GitHub account and find the repository: `spooktacular-halloween-registration`.
5. Click **"Import"**.

---

### Step 5: Configure Environment Variables in Vercel

In the Vercel project configuration screen (or under **Project Settings** -> **Environment Variables**), add the following production variables:

| Variable Name | Description | Example / Instructions |
|---|---|---|
| `NODE_ENV` | Runtime environment | `production` |
| `SUPABASE_URL` | Supabase Project URL | `https://your-project-id.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJhbGciOiJIUzI1NiIsIn...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJhbGciOiJIUzI1NiIsIn...` (Server-side only) |
| `ADMIN_JWT_SECRET` | Secret key for signing admin JWT tokens | A secure random 32+ character string |
| `SESSION_SECRET` | Secret key for sessions | A secure random string |
| `ADMIN_USERNAME` | Admin portal username | `admin` |
| `ADMIN_PASSWORD` | Strong password for admin login | `YourSecurePassword2026!` |
| `ADMIN_EMAIL` | Admin alert email | `admin@spooktacular2026.com` |
| `CORS_ORIGIN` | Allowed origin for frontend requests | `https://your-project.vercel.app` (or `*`) |

> [!CAUTION]
> Never prepend `VITE_` or `NEXT_PUBLIC_` to `SUPABASE_SERVICE_ROLE_KEY` or `ADMIN_JWT_SECRET`. They must remain strictly server-side.

---

### Step 6: Deploy to a Vercel Preview Environment

1. To test changes before impacting production, create a new branch or open a pull request:
   ```bash
   git checkout -b preview-test
   git push origin preview-test
   ```
2. Vercel automatically detects the branch and creates an isolated **Preview Deployment** with a unique preview URL.
3. Test the registration flow, PhonePe QR countdown, and admin panel on the preview URL.

---

### Step 7: Deploy to Production

1. Merge your changes into the `main` branch:
   ```bash
   git checkout main
   git merge preview-test
   git push origin main
   ```
2. Vercel will trigger a production deployment.
3. Once completed, your application will be live at `https://<your-project>.vercel.app`.

---

### Step 8: Comprehensive Verification & Testing

Verify all production features:

1. **Pricing Rule Verification:**
   - Check the banner on the homepage and registration form.
   - On or before 25 October 2026: ₹249 / participant.
   - 26 October through 30 October 2026: ₹299 / participant.
   - Total amount is calculated on the server and verified.
2. **Registration Flow:**
   - Complete a booking with valid details (Name, Phone, Participant Count, City, State, District).
   - Check that you are redirected to the PhonePe payment page with the 3-minute timer.
3. **Timer & Countdown:**
   - Refresh the page during payment countdown. Verify that the countdown does NOT reset to 3 minutes, but continues from the server-calculated remaining time.
4. **Duplicate UTR Protection:**
   - Submit a 12-digit transaction reference (e.g. `UPI123456789012`).
   - In another browser tab, register again and attempt to submit the exact same UTR.
   - Verify that the second submission is rejected with a clear duplicate error.
5. **Admin Verification & Ticket Issuance:**
   - Navigate to `/admin/login`.
   - Log in using your configured admin credentials.
   - Under **Pending Payments**, locate the registration.
   - Click **"Approve"**.
   - Verify that a confirmed ticket (`SPH-2026-XXXXXX`) is generated with a valid QR code.
   - Attempting to approve again will not issue duplicate tickets.
6. **Ticket Gate Validator:**
   - Go to `/validate` and enter the ticket number.
   - Confirm it validates as active.
7. **Excel Export:**
   - From the Admin Dashboard, click **"Export to Excel"**.
   - Open the downloaded `.xlsx` file and confirm both the **Registrations** data sheet and **Executive Summary** financial sheet are populated correctly.

---

### Step 9: Verify Persistence Across Refreshes & Redeployments

1. Submit a registration and approve it in production.
2. Note the Registration ID and Ticket Number.
3. Trigger a redeployment in Vercel (e.g., click **"Redeploy"** in the Vercel dashboard).
4. After redeployment completes, refresh your browser and revisit:
   - The attendee ticket confirmation page (`/ticket`).
   - The Admin Dashboard statistics and registration tables.
   - The Gate Validator (`/validate`).
5. Confirm all registrations, financial totals, and tickets persist unchanged in Supabase PostgreSQL.

---

### Step 10: Configure a Custom Domain (Optional)

1. In the Vercel Dashboard, go to your project -> **Settings** -> **Domains**.
2. Enter your custom domain (e.g. `spooktacularparty.com` or `tickets.myevent.com`).
3. Add the DNS records provided by Vercel (`CNAME` or `A` record) in your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.).
4. Once DNS propagates, Vercel automatically generates and renews a free Let's Encrypt SSL/TLS certificate.
5. Update `CORS_ORIGIN` in Vercel Project Settings to match your custom domain.

---

## 💻 Local Offline Development

You can continue developing and testing locally without any internet connection or external Supabase account:

```bash
# Run automated test suites (29 tests)
cd server
npm test

# Run local development servers concurrently
cd ..
npm run dev
```

- Local frontend: `http://localhost:5173`
- Local API server: `http://localhost:3001`

---

## 🔒 Security Summary

- **Secrets Isolation:** No API secret keys, database credentials, or tokens are included in client JavaScript bundles.
- **Row Level Security:** Anonymous clients cannot scrape attendee PII or unverified financial claims.
- **Stateless Admin Authentication:** Admin sessions use cryptographically signed JWT cookies verified on each request.
- **Financial Audit Logging:** Every payment approval, rejection, cancellation, duplicate resolution, and Excel export creates an immutable record in `admin_audit_log`.

---

## 📄 License
ISC License. Built for Spooktacular Halloween Party 2026.
