<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Structure

Working directory is `task-manager/`. Root contains only documentation.

- `src/app/` - Next.js App Router with route groups: `(auth)`, `(dashboard)`
- `src/components/` - React components, tests in `__tests__/` subdirectory
- `src/lib/` - Auth, Prisma client, and validation schemas
- `src/generated/prisma/` - Prisma client (generated, gitignored)

## Essential Commands

Build order matters: Prisma must be generated before building
```bash
npm run build      # Runs: prisma generate && next build
npm run quality    # Runs: lint -> type-check -> test
```

Development and testing:
```bash
npm run dev
npm run test
npm run test:watch
npm run type-check
npm run lint
```

Database:
```bash
npm run db:generate    # Generate Prisma client to src/generated/prisma
npm run db:push        # Push schema changes to database
npm run db:studio      # Open Prisma Studio
```

## Prisma Configuration

- Database: PostgreSQL with `@prisma/adapter-pg` adapter
- Custom client output: `src/generated/prisma` (NOT default node_modules/.prisma)
- Client initialized with custom adapter in `src/lib/prisma.ts`
- Global singleton pattern for development hot-reload

## Tailwind CSS v4

Uses Tailwind v4 with new `@import "tailwindcss"` syntax in `globals.css`. Do NOT use v3 `@tailwind` directives.

## Testing

- Jest with `next/jest` and jsdom environment
- Path alias `@/` maps to `src/`
- Mock async handlers with `.mockResolvedValue(undefined)`
- Tests in `src/components/__tests__/` follow component name pattern

## Docker (Phase 2)

- Next.js standalone output enabled (`output: "standalone"` in next.config.ts)
- Multi-stage Dockerfile: deps → build → minimal runner
- Docker Compose: app + PostgreSQL 17 Alpine
- Runner image does NOT contain Prisma CLI — run schema pushes from host:
  ```bash
  # Start containers
  docker compose up -d --build
  # Push schema from host (port 5432 mapped to localhost)
  set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskmanager
  npx prisma db push
  ```
- Docker PostgreSQL is separate from Supabase — register new users inside the containerized app
- `AUTH_TRUST_HOST=true` required in Docker environment (NextAuth v5 security)
- Common commands:
  ```bash
  docker compose up -d --build   # Build and start
  docker compose ps              # Check status
  docker compose logs -f app     # View app logs
  docker compose down            # Stop containers
  docker compose down -v         # Stop and delete DB volume
  ```

## CI/CD (Phase 3)

- GitHub Actions workflow: `.github/workflows/ci.yml` (at repo root)
- Working directory for all steps: `task-manager/`
- Three jobs: `quality` → `security` → `docker`
- **quality**: lint, type-check, test (runs on every push and PR to main)
- **security**: npm audit + Trivy filesystem scan (runs in parallel with quality)
- **docker**: build + push to Docker Hub (only on main push, after quality + security pass)
- Docker build context: `./task-manager`
- Required GitHub secrets: `DOCKER_USERNAME`, `DOCKER_PASSWORD`

## Authentication

- NextAuth v5 beta with Credentials provider + bcryptjs
- JWT session strategy with custom ID injection via callbacks
- Sign-in page: `/login` (custom route)
- Session accessible via `auth()` from `@/lib/auth`
