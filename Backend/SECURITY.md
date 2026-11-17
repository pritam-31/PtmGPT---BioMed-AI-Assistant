# Security notes

This document describes the security measures implemented by the backend.

## Implemented

- **Password storage:** bcrypt with a per-user salt (10 rounds).
- **Sessions:** server-side cookie sessions (`express-session`). In
  `NODE_ENV=production`, the server refuses to start without a strong
  `SESSION_SECRET`. Cookies are `httpOnly`, `sameSite=lax`, and `secure` in
  production.
- **Session store:** `connect-mongo` stores sessions in MongoDB instead of the
  in-memory store (MemoryStore is used only for automated tests).
- **Login enumeration:** unknown email and wrong password return the same
  `401 Invalid email or password`.
- **Input validation:** signup, login, plan, and webhook payloads are validated
  with `zod` (email format, mobile format, password length).
- **Rate limiting:** `express-rate-limit` on the whole API plus stricter limits
  on `/api/auth/login` and `/api/auth/signup`, and on chat.
- **Security headers:** `helmet`.
- **CORS:** restricted to the origins listed in `FRONTEND_ORIGIN`.
- **Uploads:** Multer caps uploads at 20 MB and accepts images (PNG/JPEG/WebP) or
  PDF reports only; other formats are rejected. Images are limited to 5 MB and
  their real type is verified from magic bytes. All files are stored in
  Cloudinary; there is no local disk fallback.
- **Plans:** normal users can no longer grant themselves a paid plan. Plan
  changes require an admin (`role: "admin"` or an email in `ADMIN_EMAILS`) or
  the shared-secret payment webhook.
- **Error responses:** production responses do not include stack traces or raw
  internal error messages.

## Reporting

If you find a security issue, please open an issue without including secrets or
personal data.
