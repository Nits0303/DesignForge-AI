This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Dev server & browser console

- **`npm run dev`** uses webpack (`next dev --webpack`). Chrome may log a benign warning that `layout.css` was **preloaded but not used** within a few seconds — this is a known Next.js dev + CSS chunk behavior. To reduce it, use **`npm run dev:turbo`** (Turbopack). Production builds are unaffected.
- Duplicate **form field id** issues on the Workspace were addressed by giving mobile vs desktop panels distinct element ids.

### Gemini API (testing without Anthropic)

1. In [Google AI Studio](https://aistudio.google.com/) create an API key and add it to `.env` as **`GEMINI_API_KEY`**.
2. In Google Cloud, enable **Generative Language API** for the project linked to that key (APIs & Services → Library).
3. Leave **`ANTHROPIC_API_KEY` unset** so the app uses Gemini (if Anthropic is set, it takes priority).
4. Restart the dev server after changing `.env`.
5. Optional: **`GEMINI_MODEL`** — override the default (`gemini-2.5-flash`) if your region/account doesn’t offer that model (try `gemini-2.0-flash`).
6. Free tier quotas are small; **429 / rate limit** means wait or upgrade. If you see a **auth/model** message in the UI, the app is surfacing Google’s error text—fix the key, API enablement, or model name.
7. **`AI_DEBUG=true`** in `.env` logs raw Gemini errors to the server terminal.

### Database & Prisma

After pulling changes or editing `prisma/schema.prisma`, sync the client and database:

```bash
npm run db:generate          # regenerates @prisma/client (also runs on npm install via postinstall)
npx prisma migrate deploy    # apply migrations (production)
# or in dev, if migrations are behind schema:
npx prisma db push
```

If you see **`Unknown argument submissionStatus`** (or similar) on marketplace APIs:

1. Run **`npm run db:generate`** (or `npx prisma generate`).
2. **If the dev server was already running**, save any file or hit the page again — the app recreates the Prisma client when the generated engine files change. If it still fails, stop the server and run **`npm run dev:fresh`** (clears `.next` + starts dev).

On **Windows**, if `prisma generate` fails with **EPERM** renaming `query_engine-windows.dll.node`, close the dev server, any Node/Prisma Studio processes, and antivirus locks on `node_modules`, then retry.

If errors become **missing column / relation** in SQL, run **`npx prisma migrate deploy`** or **`npx prisma db push`** so the database matches `schema.prisma`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
