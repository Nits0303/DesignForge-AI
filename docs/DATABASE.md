# Database schema & data safety

## Why 500s happen

The Prisma **schema** (`prisma/schema.prisma`) must match your **PostgreSQL** database. If you pull new code (e.g. Sprint 18) but never apply schema changes, queries fail with errors like:

- `P2021` — table does not exist  
- `P2022` — column does not exist  

That can break **all** pages that hit the API (brands, projects, templates, etc.). **Existing rows are usually still on disk**; the app simply cannot read them until the missing tables/columns exist.

## Fix (local / staging)

After upgrading code:

```bash
# Stop `next dev` first on Windows if `prisma generate` hits EPERM.
npx prisma db push
npx prisma generate
npm run dev
```

For production, prefer versioned migrations:

```bash
npx prisma migrate deploy
```

## Protecting client data

1. **Back up PostgreSQL** before any schema change (dump / snapshot).  
2. **`prisma db push`** / **`migrate`** typically **add** tables and nullable columns — they do **not** delete existing brand or design rows when adding things like `BrandProfile.teamId` (nullable).  
3. **Never** run raw SQL that `DROP TABLE` / `TRUNCATE` without a backup.  
4. In CI/CD, run **`prisma migrate deploy`** (or `db push` only for throwaway envs) on every deploy **before** starting the app.

## Optional: env for debugging white-label

If white-label fails silently, set `DEBUG_WHITELABEL=1` in `.env` to log errors (development only).
