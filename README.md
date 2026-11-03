<<<<<<< HEAD
# PtmGPT

PtmGPT is a **research prototype** for a medical-themed chat assistant. It has a
React frontend, a Node/Express bridge with MongoDB, and a Python FastAPI service
that is intended to host a local medical vision-language model.

> **Status: work in progress.** The local model integration code is being built,
> but the model weights are **not** included in this repository. Until you install
> and run a model yourself, local (BioMed) mode returns a clear `503` error instead
> of an answer. See [Current status](#current-status) and
> [`docs/LOCAL_MODEL_SETUP.md`](docs/LOCAL_MODEL_SETUP.md).

> **Not medical advice. Not a medical device.** This project is an educational
> prototype. It must not be used for diagnosis, treatment, prescriptions, dosage,
> or any real clinical decision. In an emergency, contact local emergency services.

## Overview

- Chat with a model in two modes:
  - **Cloud mode** — text and images are sent to a third-party provider (OpenAI).
  - **Local mode (BioMed)** — text and images are forwarded to the local Python
    service. This only works once a real local model is installed and running.
- Optional image upload with a 5 MB cap.
- Accounts with bcrypt-hashed passwords and server-side cookie sessions.
- Per-user chat threads stored in MongoDB.
- Light/dark/system themes.

## Architecture

```
Browser (React + Vite)
        │  FormData: threadId, message, mode, image
        ▼
Node/Express bridge  ──► MongoDB Atlas (users, threads)
        │
        ├── mode=openai ──► OpenAI API (third-party cloud)
        ├── image storage ──► Cloudinary, or local ./uploads fallback
        └── mode=biomed ──► Python FastAPI :8001  ──► local model backend
                                                    (transformers | ollama | llamacpp)
```

The Node backend talks to the Python service over `POST /analyze` (multipart:
`prompt`, `mode`, optional `image`) and expects JSON containing `reply`
(`generated_text` / `text` are also accepted for compatibility).

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite, plain CSS |
| Bridge / API | Node.js, Express 5, Mongoose, express-session, bcrypt, Multer |
| Database | MongoDB (Atlas or local) |
| Image storage | Cloudinary with local disk fallback |
| AI service | Python 3, FastAPI, Uvicorn, Pillow |
| Local model backends | Hugging Face Transformers, Ollama, or llama.cpp (optional) |

## Prerequisites

- Node.js 20+ (developed on Node 22)
- Python 3.10+ (developed on 3.14)
- A MongoDB connection string (Atlas or local)
- Optional: an OpenAI API key for cloud mode
- Optional: Cloudinary credentials for image hosting
- Optional: a local model backend (see `docs/LOCAL_MODEL_SETUP.md`)

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

With no backend configured (`LOCAL_BACKEND=none`, the default), the service starts
and `/health` reports `model_loaded: false`; `/analyze` returns `503`. That is
expected until you follow `docs/LOCAL_MODEL_SETUP.md`.

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

## Environment variables

### Backend (`Backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port (default `8080`). |
| `MONGODB_URI` | Yes | MongoDB connection string. |
| `SESSION_SECRET` | Yes in production | Signs session cookies. **Required** when `NODE_ENV=production`. |
| `NODE_ENV` | No | `development` or `production`. |
| `FRONTEND_ORIGIN` | No | Comma-separated allowed origins for CORS. |
| `OPENAI_API_KEY` | For cloud mode | OpenAI key. |
| `OPENAI_MODEL` | No | Cloud model id (default documented in `.env.example`). |
| `OPENAI_HISTORY_MESSAGES` | No | How many prior messages to include (default `10`). |
| `LOCAL_AI_URL` | No | Python `/analyze` URL (default `http://127.0.0.1:8001/analyze`). |
| `LOCAL_AI_HEALTH_URL` | No | Python `/health` URL (default `http://127.0.0.1:8001/health`). |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret. |
| `ADMIN_EMAILS` | No | Comma-separated emails allowed to grant plans (admin upgrade route). |
| `PAYMENT_WEBHOOK_SECRET` | No | Shared secret for the stub payment webhook. |

### Frontend (`Frontend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | No | Backend base URL (default `http://localhost:8080`). |
| `VITE_UPI_ID` | No | UPI ID shown in the upgrade modal. Leave empty to hide payment QR. |
| `VITE_UPI_MERCHANT_NAME` | No | Merchant name shown in the UPI link. |

### Python service (`PtmGPT-AI-Server/.env`)

See `PtmGPT-AI-Server/.env.example` and `docs/LOCAL_MODEL_SETUP.md`.

## Privacy — where your data goes

| Data | Cloud mode (`openai`) | Local mode (`biomed`) |
| --- | --- | --- |
| Prompt text | Sent to OpenAI. | Sent to the local Python service on your machine. |
| Uploaded image | Uploaded to Cloudinary (if configured), then sent to OpenAI. | Uploaded to Cloudinary (if configured), then forwarded to the local Python service. |
| Chat history | Stored in your MongoDB. | Stored in your MongoDB. |
| Account data | Stored in your MongoDB. | Stored in your MongoDB. |

This project is **not** "100% local" and does **not** guarantee zero data leakage.
Cloud mode is a third-party service; image uploads may leave your machine even in
local mode unless you disable Cloudinary. See `SECURITY.md`.

## Current status

| Area | State |
| --- | --- |
| Frontend UI, auth, threads | Working. |
| Cloud mode (text) | Working when `OPENAI_API_KEY` is set. |
| Cloud mode (vision) | Implemented with proper image content parts; verify against current OpenAI docs. |
| Local model inference | Integration code only — **model weights are not included**. `/analyze` returns `503` until you install a backend. |
| Payments / plans | **Not implemented.** Upgrade endpoints are stubs/admin-only; no real payment processing. |
| Medical safety | System prompt, disclaimers, emergency guard. |
| RAG / citations | Not implemented (roadmap). |
| Tests / CI | See `Backend/tests`, `PtmGPT-AI-Server/tests`, and `.github/workflows`. |

## Known limitations

- Not a medical device; outputs may be wrong or incomplete.
- Local model quality, speed, and hardware requirements depend entirely on the
  model and backend you choose. Numbers in the docs are **unverified** until you
  measure them.
- Cloud vision support depends on the current OpenAI API; model ids change.
- No real payment integration.
- No retrieval-augmented generation or citation of clinical sources yet.

## Roadmap

1. Finish and verify local model integration (Transformers / Ollama / llama.cpp).
2. Real payment flow with verified webhooks.
3. Retrieval over a curated biomedical corpus with citations.
4. Evaluation harness and safety red-team tests.

## License

MIT — see [`LICENSE`](LICENSE).
=======
# 🧬 PtmGPT: Multimodal Medical AI Assistant

PtmGPT is a highly secure, privacy-first web application designed for advanced medical image and text analysis. By utilizing a **Local Python AI Server** as its core brain, PtmGPT ensures that sensitive medical queries and images never leave your local machine. It combines a premium, minimalist UI (inspired by top-tier tech brands) with the raw analytical power of Google's MedGemma 4B model.

## 🚀 Key Features

* **100% Local Inference:** The AI brain runs locally via a Python FastAPI server, ensuring zero data leakage to public clouds.
* **Multimodal Capabilities:** Seamlessly processes both text prompts and medical image uploads (e.g., X-rays, MRIs, dermatoscopic images).
* **Soft-Gate Authentication:** A seamless UX that allows users to explore the UI, but prompts a secure JWT & bcrypt-backed Login/Signup when they attempt to interact with the AI.
* **Premium Theming:** Includes System Default, Light Mode, and Dark Mode toggles integrated directly into the user settings dropdown.
* **Modern Bridge Architecture:** A robust Node.js/Express backend that handles API routing, Multer memory storage for files, MongoDB interactions, and data handoffs to the Python server.

## 🧠 The AI Brain: MedGemma 4B

PtmGPT integrates the MedGemma 4B model, a specialized vision-language model trained for medical contexts. [cite_start]In addition to public datasets, MedGemma was also trained on de-identified, licensed datasets or datasets collected internally at Google from consented participants[cite: 1]. Its robust training includes:

* **Radiology dataset 1:** De-identified dataset of different CT studies across body parts from a US-based radiology outpatient diagnostic center network.
* **Ophthalmology dataset 1 (EyePACS):** De-identified dataset of fundus images from diabetic retinopathy screening.
* **Dermatology dataset 1:** De-identified dataset of teledermatology skin condition images (both clinical and dermatoscopic) from Colombia.
* **Dermatology dataset 2:** De-identified dataset of skin cancer images (both clinical and dermatoscopic) from Australia.
* **Dermatology dataset 3:** De-identified dataset of non-diseased skin images from an internal data collection effort.
* **Pathology dataset 1:** De-identified dataset of histopathology H&E whole slide images created in collaboration with an academic research hospital and biobank in Europe.Comprises de-identified colon, prostate, and lymph nodes.
* **Pathology dataset 2:** De-identified dataset of lung histopathology H&E and IHC whole slide images created by a commercial biobank in the United States.
* **Pathology dataset 3:** De-identified dataset of prostate and lymph node H&E and IHC histopathology whole slide images created by a contract research organization in the United States.
* **Pathology dataset 4:** De-identified dataset of histopathology whole slide images created in collaboration with a large, tertiary teaching hospital in the United States.Comprises a diverse set of tissue and stain types, predominantly H&E.
* **EHR dataset 1:** Question/answer dataset drawn from synthetic FHIR records created by Synthea. The test set includes 19 unique patients with 200 questions per patient divided into 10 different categories.

## 🏗️ Architecture Flow

1.  **React Frontend:** Captures text and image inputs via a modern UI. Sends data as `FormData` to the Node backend.
2.  **Node.js/Express Bridge:** Intercepts the request, verifies JWT auth, saves user chat history to MongoDB, and forwards the raw image buffer and text to the Python Server.
3.  **Python FastAPI Server:** The "Brain". Receives the data, converts images to tensors, processes them through the locally hosted MedGemma 4B model, and returns the generated medical insights.

## 🛠️ Tech Stack

* **Frontend:** React, Context API, CSS (Premium Theming)
* **Backend (Bridge):** Node.js, Express.js, Multer, JWT, bcrypt, MongoDB (Mongoose)
* **Backend (AI Server):** Python, FastAPI, PyTorch, Transformers, Uvicorn

## ⚙️ Local Setup Instructions

To run PtmGPT locally, you will need to operate three separate terminal instances.

### 1. Start the AI Server (Terminal 1)
```bash
cd PtmGPT-AI-Server
pip install -r requirements.txt
python ai_server.py


### 2. Start the Node.js Bridge (Terminal 2)
```bash
cd Backend
npm install
# Ensure your .env file is configured with MONGODB_URI and JWT_SECRET
npm start

### 3. Start the React Frontend (Terminal 3)
```bash
cd Frontend
npm install
npm run dev

....
>>>>>>> f28807323bc5048ea2d07bd5e0aa1f7ba2bab553
