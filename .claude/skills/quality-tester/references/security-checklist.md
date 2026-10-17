# Security Checklist

Use for any change touching auth, user input, or data access.

## Authentication
- [ ] Passwords hashed with argon2; never stored or logged in plain text
- [ ] Login errors don't reveal whether the email exists
- [ ] Password minimum length enforced server-side (8+)
- [ ] JWT signed with `JWT_SECRET` from env; expiry set; verified on every task route
- [ ] Tokens never logged or put in URLs

## Authorization
- [ ] Every task query filters by `user_id` from the token, not the request body or params
- [ ] Another user's task returns 404 on get, patch, and delete
- [ ] No endpoint returns other users' data or password hashes

## Input and injection
- [ ] Every request body, query param, and path param validated with zod
- [ ] `status` filter accepts only `active|completed|all`
- [ ] SQL uses parameterized statements only, no string concatenation
- [ ] React output is escaped; no `dangerouslySetInnerHTML` with user data

## Secrets and config
- [ ] No secrets in code, tests, docs, or commits; `.env` is git-ignored
- [ ] `.env.example` lists every variable with fake values
- [ ] CORS origin is explicit, not `*`, in production

## Errors and logging
- [ ] Unknown errors return a generic 500; stack traces stay in logs
- [ ] Logs exclude passwords, hashes, and tokens

## Dependencies
- [ ] No new dependency added without approval
- [ ] Run `npm audit`; report high/critical issues
