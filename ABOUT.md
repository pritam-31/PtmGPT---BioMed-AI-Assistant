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
