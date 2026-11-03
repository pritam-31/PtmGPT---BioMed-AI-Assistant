# PtmGPT — Repository Audit

Read-only audit performed before any code changes. Every claim below is based on
reading the source files in this repository. Anything that could not be verified by
reading code is marked **unverified**.

Repository snapshot at audit time: single commit `b8a5f5d "new version"`.

## 1. Architecture map

Three processes are intended to run together:

```
┌─────────────────────┐     FormData (text + image)     ┌──────────────────────┐
│  Frontend (React 19 │ ──────────────────────────────> │ Backend (Express 5)  │
│  + Vite)            │ <────────────────────────────── │ cookie-session auth  │
└─────────────────────┘        JSON { reply, user }     └──────────┬───────────┘
                                                                   │
                                          ┌────────────────────────┼─────────────────────────┐
                                          │                        │                         │
                                          v                        v                         v
                                 ┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
                                 │ MongoDB (Atlas) │     │ OpenAI API (cloud)│     │ Cloudinary / disk │
                                 │ users + threads │     │ mode = "openai"   │     │ image storage     │
                                 └─────────────────┘     └──────────────────┘     └──────────────────┘
                                                                   │
                                                          mode = "biomed" (POST /analyze)
                                                                   v
                                                        ┌──────────────────────────┐
                                                        │ Python FastAPI :8001      │
                                                        │ ai_server.py (STUB)       │
                                                        └──────────────────────────┘
```

### Components

| Area | File | Responsibility |
| --- | --- | --- |
| Frontend entry | `Frontend/src/main.jsx` | Mounts `<App />` in StrictMode. |
| App shell / auth | `Frontend/src/App.jsx` | Session check, login/signup modal, theme, context provider. |
| Chat UI | `Frontend/src/ChatWindow.jsx`, `Chat.jsx` | Input, image upload preview, mode switch, send to `/api/chat`. |
| Sidebar | `Frontend/src/Sidebar.jsx` | Thread list / create / delete. |
| Upgrade UI | `Frontend/src/UpgradeModal.jsx` | Plan cards, UPI QR, calls `/api/auth/upgrade`. |
| Backend entry | `Backend/server.js` | Express app, CORS, session, Mongo connection, routes. |
| Auth routes | `Backend/routes/auth.js` | signup / login / me / logout / upgrade. |
| Chat routes | `Backend/routes/chat.js` | thread CRUD + `/api/chat` (upload → store → AI → save). |
| Auth middleware | `Backend/middleware/auth.js` | `requireAuth`, `requireRole`, `setSessionUser`. |
| AI dispatch | `Backend/utils/local_ai.js` | Chooses OpenAI vs local Python server; 429 fallback. |
| OpenAI client | `Backend/utils/openai.js` | Raw `node-fetch` call to Chat Completions. |
| Image storage | `Backend/utils/upload.js` | Cloudinary stream, disk fallback. |
| Models | `Backend/models/User.js`, `Thread.js` | Mongoose schemas. |
| AI server | `PtmGPT-AI-Server/ai_server.py` | FastAPI `/analyze` — **echo stub**. |

### Environment variables actually read by code

| Variable | Read in | Notes |
| --- | --- | --- |
| `PORT` | `Backend/server.js:12` | Defaults 8080. |
| `MONGODB_URI` | `Backend/server.js:13` | Falls back to `mongodb://127.0.0.1:27017/test`. |
| `SESSION_SECRET` | `Backend/server.js:34` | Insecure hard-coded default. |
| `NODE_ENV` | `Backend/server.js:41`, `Backend/routes/auth.js:114` | Toggles `secure` cookie. |
| `FRONTEND_ORIGIN` | `Backend/server.js:18` | Comma-separated CORS allowlist. |
| `LOCAL_AI_URL` | `Backend/utils/local_ai.js:4` | Default `http://127.0.0.1:8001/analyze`. |
| `OPENAI_API_KEY` | `Backend/utils/local_ai.js:5,47`, `Backend/utils/openai.js:5` | Required for cloud mode. |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | `Backend/utils/upload.js:7-9` | Image upload. |
| `VITE_API_BASE_URL` | `Frontend/src/App.jsx:9` | Frontend API base. |

Not read anywhere: `JWT_SECRET`, `JWT_EXPIRES_IN` (documented but nonexistent).
`OPENAI_MODEL` is **not** read — the model is hard-coded (see below).

## 2. README / docs claim vs actual code

| Claim (README / ABOUT) | Reality in code | Evidence |
| --- | --- | --- |
| "Powered by a local Python inference server … MedGemma 4B" | Python server loads no model; it echoes the prompt back. | `PtmGPT-AI-Server/ai_server.py:14-20,43-47` |
| "100% Local Inference … zero data leakage" | Default chat mode is `openai`; images go to Cloudinary. | `Frontend/src/ChatWindow.jsx:20`; `Backend/utils/upload.js:12-46` |
| "MedGemma 4B model … converts images to tensors, processes them" | No torch/transformers import; image only converted to PIL then ignored. | `ai_server.py:5-7,29-47` |
| "secure JWT & bcrypt-backed Login/Signup" | JWT is never used; auth is express-session cookie + bcrypt. | `Backend/server.js:32-44`; `Backend/middleware/auth.js`; no `jsonwebtoken` import |
| "verifies JWT auth" | Verifies `req.session.user`. | `Backend/middleware/auth.js:11-18` |
| "Node.js/Express Bridge … forwards raw image buffer and text to the Python Server" | True for `biomed` mode only; OpenAI mode sends text. | `Backend/utils/local_ai.js:9-44,52-62` |
| "Requires JWT_SECRET" | Code requires `SESSION_SECRET` (with insecure default). | `Backend/server.js:34` |
| "Multimodal medical image analysis" in cloud mode | Image is appended as a base64 **string inside the text prompt**, not a vision content part. | `Backend/utils/local_ai.js:54-58`; `Backend/utils/openai.js:27-35` |
| "requirements.txt" referenced in setup | File does not exist. | repo root / `PtmGPT-AI-Server/` |

Additional doc artifacts: `[cite_start]` / `[cite: 1]` markers in `ABOUT.md:15`.
`ABOUT.md` largely duplicates `README.md` and the marketing claims.

## 3. Prioritized issues

### Critical

1. **Local AI is a stub that fakes success.** `ai_server.py` prints
   "Model Loaded Successfully!" and returns `f"BioMed mode active ... Prompt was: '{prompt}'."`
   A user cannot tell this is not a model answer (`ai_server.py:20,43-47`).
2. **Privacy claim contradicts behavior.** Default mode is cloud OpenAI
   (`ChatWindow.jsx:20`), images upload to Cloudinary (`upload.js:12-46`). README/ABOUT
   claim 100% local / zero leakage.
3. **Self-service paid upgrade.** Any authenticated user can POST
   `/api/auth/upgrade` and become `cloud`/`premium` with unlimited chats, no payment
   (`routes/auth.js:120-144`; `UpgradeModal.jsx:52-81`).
4. **Personal UPI ID hard-coded in the frontend.** `UpgradeModal.jsx:37`
   (`6372516197-2@ibl`) is shipped to every browser and committed to git.

### High

5. **No medical safety layer.** No system prompt, no disclaimer, no emergency
   handling, no refusal policy (`utils/openai.js`, `utils/local_ai.js`).
6. **BioMed echo looks like a real reply.** The stub text is displayed as an
   assistant message (`routes/chat.js:123-141`, `ChatWindow.jsx:132-136`).
7. **Docs claim JWT; code uses cookie sessions.** Misleading (`ABOUT.md:9,31,37`).
8. **No `requirements.txt` and no `.env.example`.** A stranger cannot reproduce setup.
9. **No real vision input in cloud mode.** Base64 appended as text
   (`local_ai.js:54-58`); `openai.js` ignores `imageUrl` content parts.
10. **Security gaps:** insecure `SESSION_SECRET` default (`server.js:34`),
    MemoryStore session store (`server.js:32`), no helmet, no rate limiting,
    login user enumeration (`auth.js:71` returns 404 "User not found"), no
    server-side validation (`auth.js:23-29`), multer trusts client mimetype
    (`chat.js:12-15`).
11. **Hard-coded model name `gpt-5.4-mini`.** Validity unverified; if it fails,
    canned fallback strings are returned as if they were answers
    (`openai.js:28,46-73`).

### Medium

12. **Chat history is not sent to the model.** Each turn is stateless
    (`openai.js:27-35` sends a single user message).
13. **No RAG / citations / biomedical data source.** "Biomedical assistant" has no
    evidence base.
14. **No tests, CI, or evaluation.** No test files, no `.github/workflows`.
15. **No LICENSE.**
16. **Thread ownership race / leak:** `Thread.findOne({ threadId })` then checks
    owner (`chat.js:96-100`); also thread `threadId` is client-supplied and unique
    globally, so a collision across users returns 403 instead of creating a new
    thread.

### Low

17. **Stray committed files:** `cookiejar.txt`, `Frontend/response.json`
    (an OpenAI models dump), default Vite `Frontend/README.md`.
18. **Doc artifacts / duplication:** `[cite_start]`, `[cite: N]`, duplicate
    `ABOUT.md`.
19. **Commit history is a single snapshot commit** (`b8a5f5d`).
20. **Unused dependencies:** `jsonwebtoken`, `form-data` (global `FormData`/`fetch`
    are used instead); `connect-mongo` installed but unused.

## 4. Dead dependencies and dead files

- Unused deps: `jsonwebtoken`, `form-data` (verify by grep — no imports), and
  `connect-mongo` is installed but not wired into the session config.
- `node-fetch` is used in `utils/openai.js` only; Node 22 provides global `fetch`.
- Dead/committed junk: `cookiejar.txt`, `Frontend/response.json`,
  `Frontend/README.md` (Vite template), `PtmGPT-AI-Server/__pycache__/*.pyc`
  (present on disk, untracked), `Frontend/dist/` (untracked build output).
- Empty directory `.agents/`.

## 5. Real vs stub

| Real, working code | Stub / placeholder / broken |
| --- | --- |
| Express server boot + Mongo connect (one-shot) | No reconnect/retry; if first connect fails the process stays disconnected forever. |
| signup/login/logout/me with bcrypt + cookie session | Login leaks user existence; no validation. |
| Thread CRUD scoped to owner | Ownership check has a race; client controls `threadId`. |
| Cloudinary upload with disk fallback | Cloudinary is called even in "local" BioMed mode. |
| OpenAI text chat | Image sent as base64 text, not vision; hard-coded unverified model; canned fallback strings. |
| Local AI forwarding (`biomed`) | Python server is an echo stub that claims success. |
| Upgrade UI + route | No payment; grants paid plans for free. |
| — | No medical safety, no disclaimers, no emergency handling. |
| — | No tests, CI, evaluation, or license. |

## 6. Top 10 issues (summary)

1. Python AI server is a fake echo stub (`ai_server.py`).
2. Privacy/README claims contradict cloud + Cloudinary behavior.
3. Free self-service plan upgrade (`/api/auth/upgrade`).
4. Personal UPI ID hard-coded and committed (`UpgradeModal.jsx:37`).
5. No medical safety system prompt / disclaimer / emergency guard.
6. Stub "BioMed" output presented as a genuine answer.
7. Docs say JWT, code uses sessions; `JWT_SECRET` unused.
8. Missing `requirements.txt` and `.env.example`.
9. Cloud image analysis isn't real vision (base64-as-text).
10. Security basics missing: session secret default, MemoryStore, no helmet/rate
    limit, user enumeration, no validation, mimetype-only upload checks.
