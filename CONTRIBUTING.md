# Contributing to Cronko

Thanks for your interest in contributing! This document outlines the process
for getting your changes merged.

## Getting Started

1. Fork the repository and clone it locally.
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` — defaults work for development.
4. (Optional) Start Redis for distributed rate limiting: `docker compose -f docker-compose.dev.yml up -d redis`
5. Start the dev servers: `pnpm dev`

API runs on `:3001`, web on `:3000`.

## Development Workflow

- Create a feature branch from `main`: `git checkout -b feat/my-feature`
- Make your changes
- Run quality checks locally before pushing:

  ```bash
  pnpm typecheck    # TypeScript strict check across all workspaces
  pnpm lint         # ESLint + Prettier across all workspaces
  pnpm test         # Vitest test suite
  pnpm build        # Verify production build
  ```
- Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`
- Push and open a Pull Request — CI will run the same checks automatically

### Pre-commit Hooks

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for pre-commit hooks. After `pnpm install`, hooks are installed automatically via the `prepare` script. On every commit:

- `pnpm typecheck` runs on staged `.ts`/`.tsx` files
- `pnpm lint` runs on staged `.ts`/`.tsx`/`.js`/`.jsx` files
- Commit messages are validated against Conventional Commits format

To skip hooks temporarily (e.g., WIP commits): `git commit -m "wip" --no-verify`

## Code Style

- **TypeScript** strict mode across all packages (`tsconfig.base.json`)
- **ESLint** flat config with security rules (`no-eval`, `no-implied-eval`) and TypeScript strict rules
- **Prettier** with Tailwind CSS plugin for consistent formatting
  - `printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`
- Use `useT()` hook for all user-facing strings (i18n)
- Keep translations in `packages/shared/src/translations.ts`
- Prefer `type` imports: `import type { ... }` and `import { type ... }`
- No unused comments — self-documenting code preferred

## Testing

This project uses [Vitest](https://vitest.dev/) as the test runner across all workspaces.

```bash
pnpm test              # Run all tests once
pnpm test -- --watch   # Run tests in watch mode
pnpm test -- --coverage # Run tests with coverage report
```

- **Unit tests** — files matching `src/**/*.test.ts` or `src/**/*.test.tsx`
- **Coverage thresholds** — currently 0% (baseline), increasing progressively each sprint
- **CI** — tests run on every PR with JUnit report upload

## CI/CD Pipeline

| Workflow       | Trigger                       | Purpose                            |
| -------------- | ----------------------------- | ---------------------------------- |
| `ci.yml`       | Push/PR to `main`             | typecheck → lint → test → build    |
| `security.yml` | Weekly (Mon 9AM UTC) + manual | `pnpm audit` + CodeQL + SBOM       |
| `deploy.yml`   | Tag `v*`                      | Build & push Docker images to GHCR |

## Project Structure

```
cronko/
├── apps/
│   ├── api/          # Hono backend (port 3001)
│   └── web/          # Next.js frontend (port 3000)
├── packages/
│   ├── database/     # Drizzle ORM schema, migrations, queries
│   └── shared/       # Types, constants, utils, i18n
├── scripts/          # Dev utilities + backup/restore
```

## Need Help?

Open an issue with the `question` label or start a discussion.
