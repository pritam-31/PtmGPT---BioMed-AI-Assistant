# PtmGPT — BioMed AI Assistant

PtmGPT is a medical-themed chat assistant. It has a
React frontend, a Node/Express bridge with MongoDB, and a Python FastAPI service
that hosts a local medical vision-language model (MedGemma 4B).

## What it does


- Chat in two modes:
  - **Cloud mode** — text and images are sent to OpenAI (requires `OPENAI_API_KEY`).
  - **Local mode (BioMed)** — text, images, and PDF reports are processed by
    MedGemma 4B on your machine.
- Accepts **text, images (PNG/JPEG/WebP), and PDF medical reports only**.
- **PDF pipeline:** PDF → PyMuPDF (text + images) → OCR for scanned pages →
  MedGemma 4B → **Summary + Findings + Explanation**. PDF reports always use the
  local MedGemma pipeline.
- Uploads are stored in Cloudinary (no local storage). Images are capped at 5 MB,
  any upload at 20 MB.
- Accounts with bcrypt-hashed passwords and server-side cookie sessions.
- Per-user chat threads stored in MongoDB.
- Light/dark/system themes.

## Architecture

```
Browser (React + Vite)
        │  FormData: threadId, message, mode, image
        ▼
Node/Express bridge ──► MongoDB (users, threads, sessions)
        │
        ├── mode=openai ──► OpenAI API
        ├── uploads ──────► Cloudinary (medical images and reports)
        └── mode=biomed ──► Python FastAPI :8001 ──► MedGemma 4B
```

The Node backend calls the Python service at `POST /analyze` (multipart:
`prompt`, `mode`, `system_prompt`, optional `image` or `pdf`) and expects JSON
with a `reply` field. It calls `GET /health` first and only forwards local
requests when the model reports `model_loaded: true`.

```
PDF report (local mode)
        │
        ▼
PyMuPDF: extract text + embedded images per page
        │
        ├── text found ──────────────┐
        └── scanned page → OCR ──────┤
                                     ▼
                          MedGemma 4B (text + page images)
                                     │
                                     ▼
                    Summary / Findings / Explanation
```

## Current status

| Area | State |
| --- | --- |
| Frontend UI, auth, threads | Working. |
| Cloud mode (text + vision) | Working when `OPENAI_API_KEY` is set. |
| File storage | Cloudinary only. Images and PDF reports are uploaded there; there is no local fallback. |
| Input types | Text, images (PNG/JPEG/WebP), and PDF. Other formats are rejected. |
| PDF analysis | Implemented: PyMuPDF extraction + OCR fallback + MedGemma, returning summary, findings, and explanation. |
| Local mode (MedGemma) | Pipeline and model call implemented. **Model weights are not included**; install them yourself. Until then `/health` reports `model_loaded: false`. |
| Tests / CI | See `Backend/tests` and `.github/workflows/ci.yml`. |

## Prerequisites

- Node.js 20+ (developed on Node 22)
- Python 3.10+ (developed on 3.14)
- MongoDB (local or Atlas)
- A Cloudinary account (required for uploads)
- An OpenAI API key for cloud mode
- Hugging Face account with access to the gated MedGemma model (for local mode)
- Tesseract OCR binary for scanned PDFs (optional but recommended):
  https://github.com/tesseract-ocr/tesseract

## Setup (three terminals)

### 1. Python AI service

```bash
cd PtmGPT-AI-Server
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env      # Windows; use `cp` on macOS/Linux
python ai_server.py
```

`requirements.txt` installs the lightweight service and PDF tooling only. With
just that, `/health` reports `model_loaded: false`. Install
`requirements-model.txt` and log in to Hugging Face for local analysis — see
[Local model setup](#local-model-setup-medgemma-4b).

### 2. Node bridge

```bash
cd Backend
npm install
copy .env.example .env      # then fill in the values
npm start
```

### 3. React frontend

```bash
cd Frontend
npm install
copy .env.example .env      # optional; defaults to http://localhost:8080
npm run dev
```

## Local model setup (MedGemma 4B)

The full pipeline is implemented in **`PtmGPT-AI-Server/ai_server.py`**:

1. `load_model()` loads the MedGemma processor and model once at startup.
2. `extract_pdf()` extracts text and embedded images with PyMuPDF and runs OCR
   for scanned pages.
3. `/analyze` builds the PDF prompt (summary, findings, explanation), runs
   MedGemma on the extracted text and page images, and returns `{"reply": ...}`.

You only need to provide the model weights:

```bash
# 1. Accept the model license on Hugging Face (gated model), then log in:
pip install huggingface_hub
huggingface-cli login

# 2. Install the Python and model dependencies:
cd PtmGPT-AI-Server
pip install -r requirements.txt
pip install -r requirements-model.txt

# 3. Start the service.
#    Default model id: google/medgemma-4b-it (override with MEDGEMMA_MODEL_ID).
python ai_server.py
```

For scanned PDFs, install the Tesseract binary and keep `OCR_ENABLED=true`
(default). `GET /health` reports `model_loaded`, `pdf_supported`, and
`ocr_available` so you can verify the setup.

On a machine without CUDA the server now pins the model to the CPU
automatically. This avoids accelerate's disk offload, which otherwise crashes
generation with `Tensor.item() cannot be called on meta tensors`. CPU inference
works but is slower; override the placement with `MEDGEMMA_DEVICE` (for example
`cuda` or `mps`) and the weight dtype with `MEDGEMMA_DTYPE=bf16` if needed.

## Environment variables

### Backend (`Backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port (default `8080`). |
| `MONGODB_URI` | Yes | MongoDB connection string. |
| `SESSION_SECRET` | Yes in production | Signs session cookies. |
| `NODE_ENV` | No | `development` or `production`. |
| `FRONTEND_ORIGIN` | No | Comma-separated allowed CORS origins. |
| `OPENAI_API_KEY` | For cloud mode | OpenAI key. |
| `OPENAI_MODEL` | No | Cloud model id (default `gpt-4o-mini`). |
| `OPENAI_HISTORY_MESSAGES` | No | Prior messages included as context (default `10`). |
| `LOCAL_AI_URL` | No | Python `/analyze` URL (default `http://127.0.0.1:8001/analyze`). |
| `LOCAL_AI_HEALTH_URL` | No | Python `/health` URL (default `http://127.0.0.1:8001/health`). |
| `LOCAL_AI_TIMEOUT_MS` | No | Max wait for a local inference response in ms (default `300000`). |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name for uploaded files. |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret. |
| `ADMIN_EMAILS` | No | Comma-separated emails allowed to grant plans. |
| `PAYMENT_WEBHOOK_SECRET` | No | Shared secret for the stub payment webhook. |

### Frontend (`Frontend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | No | Backend base URL (default `http://localhost:8080`). |
| `VITE_UPI_ID` | No | UPI ID shown in the upgrade modal. Empty hides the QR. |
| `VITE_UPI_MERCHANT_NAME` | No | Merchant name shown in the UPI link. |

### Python service (`PtmGPT-AI-Server/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEDGEMMA_MODEL_ID` | No | Hugging Face model id (default `google/medgemma-4b-it`). |
| `MEDGEMMA_LOCAL_MODEL_DIR` | No | Local weights folder (default `./model`). |
| `MEDGEMMA_DEVICE` | No | Placement: `cpu`, `cuda`, `mps`, or `auto` (default `cpu` without CUDA, `auto` with CUDA). |
| `MEDGEMMA_DTYPE` | No | Weight dtype override: `bf16` or `fp16` (default: checkpoint dtype). |
| `HF_TOKEN` | For gated models | Hugging Face access token used to download weights. |
| `OCR_ENABLED` | No | OCR for scanned PDF pages (default `true`). |
| `OCR_LANG` | No | Tesseract language code (default `eng`). |
| `MAX_PDF_PAGES` | No | Pages processed per PDF (default `10`). |
| `MAX_PDF_IMAGES` | No | Page images attached to the model (default `4`). |
| `MAX_PDF_TEXT_CHARS` | No | Extracted text character limit (default `12000`). |
| `MAX_NEW_TOKENS` | No | Model output limit (default `768`). |

## License

MIT — see [`LICENSE`](LICENSE).
