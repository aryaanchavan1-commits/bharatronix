# SSH Deployment — Bharatronix ERP Store

## Server Connection

```bash
ssh administrator@93.127.141.226 -p 10064
cd /path/to/bharatronix-erp-e-commerce-site
```

## Deployment Steps

1. **Pull latest code**
   ```bash
   git pull origin main
   ```

2. **Install dependencies** (if package.json changed)
   ```bash
   npm install
   ```

3. **Sync database schema**
   ```bash
   npx drizzle-kit push --force
   ```

4. **Seed products** (idempotent — safe to run repeatedly)
   ```bash
   node scripts/seed.mjs
   ```

5. **Restart the server**
   ```bash
   # If using pm2:
   pm2 restart bharatronix

   # Or if running directly:
   pkill -f "npm start" || true
   npm start &
   ```

## Environment Variables (on server)

Ensure these are set in `.env` on the server:

```env
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
CRON_SECRET=your-cron-secret
AUTH_EMAIL_SERVER_HOST=smtp.example.com
AUTH_EMAIL_SERVER_PORT=587
AUTH_EMAIL_SERVER_USER=your-email@example.com
AUTH_EMAIL_SERVER_PASS=your-password
AUTH_EMAIL_FROM=noreply@yourdomain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

## Login / Register Flow

- **Login**: `/login` — email + password only (no email confirmation)
- **Register**: `/register` — email + password + optional name
- **Guest purchase**: Allowed — checkout does not require account
- **My Account**: `/my-account` — shows orders if signed in, otherwise shows sign-in prompt

## Architecture

- Next.js App Router
- PostgreSQL + Drizzle ORM
- NextAuth with Credentials provider (email/password)
- Stripe checkout for payments
- Cart persisted in localStorage
