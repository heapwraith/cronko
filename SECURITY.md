# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Cronko, please **do not** open a
public issue.

Send an email to the maintainers. You should receive a response within 48 hours.
If the vulnerability is accepted, we will work on a fix and coordinate a
release timeline.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |

## Security Model

### Authentication

- **JWT with Zod validation**: Claims (`sub`, `email`, `iat`, `exp`, `iss`, `aud`) are validated with Zod schema before use — no `as` casting.
- **Access token**: 15-minute expiry, signed with HS256, stored in httpOnly cookie (`cronko_token`).
- **Refresh token**: 7-day expiry, stored in httpOnly cookie (`cronko_refresh`), path-restricted to `/api/auth`.
- **Token rotation**: POST `/auth/refresh` issues a new access token using the refresh token.
- **Passwords**: bcrypt with 12 salt rounds.
- **Login rate limiting**: 5 attempts per 15-minute window per IP+email combination.

### Transport Security

- **Cookies**: httpOnly, SameSite=Strict (Lax for legacy), Secure in production.
- **CORS**: Origins validated via environment variables (`CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`). No wildcard origins.
- **HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production.
- **CSRF Protection**: Double-submit cookie pattern on all authenticated mutating endpoints (POST/PATCH/DELETE).

### HTTP Security Headers

All responses include:

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `X-Request-Id` on every response for traceability

### Input Sanitization

- **Ping body**: Stripped of all HTML tags via `sanitize-html`, HTML entities escaped, trimmed.
- **Body size limit**: 10KB max — requests exceeding this receive HTTP 413.
- **Zod validation**: All API inputs validated with Zod schemas (monitors, notifications, settings, auth).

### Rate Limiting

- **Ping endpoints**: Rate-limited per token (60 req/min default). Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` included.
- **Memory store**: Default (dev/local). Map-based with periodic cleanup.
- **Redis**: Optional for distributed deployments. Configured via `REDIS_URL`. Automatic fallback to memory store if Redis is unavailable.

### Error Handling

- **Structured errors**: All errors return `{ error, code, requestId }` format.
- **Production mode**: Stack traces hidden from responses.
- **Development mode**: Verbose error details for debugging.
- **Request ID**: UUID generated for every request, returned in `X-Request-Id` header and error responses.

### Database

- **No hardcoded credentials**: `POSTGRES_PASSWORD` required via environment variable in Docker Compose.
- **Health checks**: `/health` (uptime), `/health/live` (process alive), `/health/ready` (database connectivity).
- **Secure defaults**: `POSTGRES_USER` and `POSTGRES_DB` have safe defaults but passwords are mandatory.

### Supply Chain

- **pnpm lockfile**: All dependencies pinned.
- **Dependency audit**: `pnpm audit --audit-level high` runs weekly via GitHub Actions.
- **SBOM**: CycloneDX SBOM generated weekly and uploaded as CI artifact.
- **CodeQL**: Static analysis runs weekly on all JavaScript/TypeScript code.
- **Renovate**: Automated dependency updates configured.

## Best Practices for Deployments

1. **Always set strong secrets**: `JWT_SECRET` (min 32 chars), `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`.
   Generate with: `openssl rand -base64 32`
2. **Use PostgreSQL in production**: SQLite is for development only.
3. **Enable Redis for rate limiting** in multi-instance deployments (`REDIS_URL`).
4. **Run behind a reverse proxy** (nginx, Caddy) with HTTPS termination.
5. **Set `NODE_ENV=production`**: Enables HSTS, Secure cookies, hides stack traces.
6. **Configure CORS_ORIGINS**: Comma-separated list of allowed frontend origins.
7. **Rotate secrets regularly**: JWT secret, admin credentials, SMTP credentials.
8. **Monitor audit logs**: Review failed login attempts and critical actions regularly.
9. **Keep dependencies updated**: Renovate will open PRs automatically.
10. **Review SBOM weekly**: Check for newly disclosed vulnerabilities in your dependency tree.
