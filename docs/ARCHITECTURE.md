# Architecture

```
[ React SPA (Vite) ] --HTTPS/JSON--> [ Express API ] --SQL--> [ SQLite file ]
        |                                  |
   stores JWT                     auth middleware verifies JWT
```

- Stateless API; the only state is the SQLite file (`DATABASE_PATH`).
- Layers: routes -> controllers -> db queries. No separate service layer at this size.
- Auth: register/login return a JWT; client sends `Authorization: Bearer <token>`.
- Authorization: all task access is scoped by the `user_id` in the token.
- Config via env vars: `PORT`, `DATABASE_PATH`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`.
- Dev: Vite dev server proxies `/api` to the Express server.
- Prod: Express serves the built client from `client/dist` (single deployable).
