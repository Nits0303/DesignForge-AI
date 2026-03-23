# Prisma — migrations & CI (DesignForge AI)

## Recommended workflow

1. **Develop locally** — after changing `prisma/schema.prisma`:
   ```bash
   npx prisma migrate dev --name describe_your_change
   ```
2. **Commit** the generated folder under `prisma/migrations/`.
3. **Deploy / CI** — apply pending migrations:
   ```bash
   npx prisma migrate deploy
   ```

## Shadow database errors (`P3006`, `P1014`)

`prisma migrate dev` uses a **shadow database** to validate migration history. If an old migration fails because tables were created out-of-band (or the DB was bootstrapped with `db push`), fix one of:

1. **Repair migration history** on a throwaway DB — reset shadow DB and ensure all prior migrations apply cleanly.
2. **Baseline** an existing production DB — use [Prisma migrate baselining](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining) if you adopted Prisma after the DB existed.
3. **Avoid `db push` in production** for teams that rely on migration history; use `migrate deploy` only.

## When `db push` is OK

- Local prototypes, or environments where **no** migration history is required.
- After `db push`, run `npx prisma generate` so the client matches the schema.

## CI snippet (example)

```yaml
- name: Prisma migrate
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Ensure `DATABASE_URL` is available and the job runs before the app starts.

## Windows file locks (`EPERM` on `prisma generate`)

If `query_engine-windows.dll.node` is locked, close Node processes using the project, stop the dev server, and rerun `npx prisma generate`.
