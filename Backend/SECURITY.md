# Security notes

This document describes what the backend currently protects and what it does
**not** protect. It is a student prototype, not a hardened production service.

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
- **Uploads:** Multer caps uploads at 5 MB, checks the declared mimetype against
  an allowlist (PNG/JPEG/WebP), and the server also verifies the real file
  signature (magic bytes) before using the image.
- **Plans:** normal users can no longer grant themselves a paid plan. Plan
  changes require an admin (`role: "admin"` or an email in `ADMIN_EMAILS`) or
  the shared-secret payment webhook.
- **Error responses:** production responses do not include stack traces or raw
  internal error messages.

## Not implemented / known gaps

- **No real payment verification.** `/api/auth/payment-webhook` only checks a
  shared secret. It is a stub and must not be trusted in production.
- **No CSRF tokens.** `sameSite=lax` mitigates common CSRF vectors but is not a
  substitute for a CSRF token on state-changing requests.
- **No account lockout** beyond IP-based rate limiting.
- **No email verification or password reset.**
- **No audit logging** of authentication or admin actions.
- **Image privacy:** uploaded images may be sent to Cloudinary (a third party)
  even in local BioMed mode unless Cloudinary is disabled.
- **Cloud mode** sends prompts and images to a third-party AI provider.
- **Thread `threadId` is client-supplied** and globally unique. A collision
  across users returns `403` rather than creating a separate thread.
- **No secrets management.** Secrets live in `.env`; keep that file out of git.

## Reporting

This is an educational project. If you find a security issue, please open an
issue without including secrets or personal data.
