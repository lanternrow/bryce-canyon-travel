# CLAUDE.md — Bryce Canyon Travel

## Critical Workflow Rules

### ALWAYS COMMIT AND PUSH
**Every change must be committed and pushed to the remote repository.** Never leave changes local-only. After completing any task that modifies code, always:
1. `git add` the changed files
2. `git commit` with a clear message
3. `git push` to the remote

No exceptions. No "I'll push later." No local-only builds. Every single change goes live.

## Project Overview

- **Framework**: React Router v7 (Remix successor) with TypeScript, Vite, SSR
- **Database**: Neon Serverless Postgres via `postgres` npm package (tagged template literals, NOT Prisma/Drizzle)
- **Storage**: Cloudflare R2 via AWS SDK v3 S3-compatible API
- **Hosting**: Deployed via git push (auto-deploy on push to master)
- **Branch**: `master` (not `main`)

## Architecture

- `app/lib/site-config.ts` — Single source of truth for all site-specific values
- `app/lib/queries.server.ts` — All database queries (tagged template SQL)
- `app/lib/storage.server.ts` — R2 file upload/delete
- `app/lib/schema.ts` — JSON-LD structured data builders
- `app/lib/claude-ai.server.ts` — Claude Vision API integration for AI metadata
- `app/lib/publish-validation.ts` — Publish gate checks (pure functions, shared server/client)
- `app/routes/admin-*.tsx` — Admin panel routes
- `scripts/` — Migration scripts (run with `node scripts/filename.mjs`)

## Conventions

- Use tagged template literals for SQL: `` sql`SELECT * FROM table WHERE id = ${id}` ``
- Settings stored in `settings` table (key-value pairs), accessed via `getSettings()`
- Admin auth via `requireApiAuth(request)` or `requireAdmin(request)`
- File prefix for AI-generated filenames: `bct` (from `siteConfig.filePrefix`)
- Tailwind CSS for all styling (no CSS modules, no inline styles)
- Migration scripts use `postgres` with `ssl: "require"` and `process.env.DATABASE_URL`

## Environment

- `.env` file contains DATABASE_URL and other secrets
- DATABASE_URL has multiline values nearby — extract carefully: `DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d'=' -f2-)`
- Never commit `.env` files
