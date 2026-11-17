import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

load_dotenv()

DEFAULT_MODEL_ID = "google/medgemma-4b-it"
LOCAL_MODEL_DIR = Path(
    os.getenv("MEDGEMMA_LOCAL_MODEL_DIR") or Path(__file__).resolve().parent / "model"
)


def resolve_model_source():
    configured = os.getenv("MEDGEMMA_MODEL_ID")
    if configured:
        return configured
    if (LOCAL_MODEL_DIR / "config.json").is_file():
        return str(LOCAL_MODEL_DIR)
    return DEFAULT_MODEL_ID


MODEL_ID = resolve_model_source()
HF_TOKEN = os.getenv("HF_TOKEN") or None
logger = logging.getLogger("ai_server")
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() != "false"
OCR_LANG = os.getenv("OCR_LANG", "eng")
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "10"))
MAX_PDF_IMAGES = int(os.getenv("MAX_PDF_IMAGES", "4"))
MAX_PDF_TEXT_CHARS = int(os.getenv("MAX_PDF_TEXT_CHARS", "12000"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "768"))

model = None
processor = None
load_error = None


def load_model():
    global model, processor, load_error

    try:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        auth = {"token": HF_TOKEN} if HF_TOKEN else {}

        # When CUDA is unavailable, device_map="auto" makes accelerate offload
        # weights to disk (meta tensors), which then crash during generation
        # with "Tensor.item() cannot be called on meta tensors". Pin the whole
        # model to the CPU in that case so every weight is materialized.
        requested_device = os.getenv("MEDGEMMA_DEVICE")
        if requested_device:
            device_map = requested_device
        elif torch.cuda.is_available():
            device_map = "auto"
        else:
            device_map = "cpu"

        load_kwargs = {
            "device_map": device_map,
            "low_cpu_mem_usage": True,
            **auth,
        }

        # bf16 halves memory usage versus fp32 and is supported on CPU.
        if os.getenv("MEDGEMMA_DTYPE", "").lower() in {"bf16", "bfloat16"}:
            load_kwargs["torch_dtype"] = torch.bfloat16
        elif os.getenv("MEDGEMMA_DTYPE", "").lower() in {"fp16", "float16"}:
            load_kwargs["torch_dtype"] = torch.float16

        processor = AutoProcessor.from_pretrained(MODEL_ID, **auth)
        model = AutoModelForImageTextToText.from_pretrained(MODEL_ID, **load_kwargs)
        model.eval()
        load_error = None
        logger.info("Loaded model from %s on %s", MODEL_ID, device_map)
    except Exception as exc:
        model = None
        processor = None
        load_error = str(exc)
        logger.exception("Failed to load model from %s", MODEL_ID)


@asynccontextmanager
async def lifespan(app):
    load_model()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "backend": "transformers",
        "model_loaded": model is not None and processor is not None,
        "model_id": MODEL_ID,
        "load_error": load_error,
        "pdf_supported": fitz is not None,
        "ocr_available": pytesseract is not None and OCR_ENABLED,
    }


def render_page(page, dpi=200):
    pixmap = page.get_pixmap(dpi=dpi)
    return Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")


def extract_embedded_image(doc, xref):
    try:
        base = doc.extract_image(xref)
        if not base or not base.get("image"):
            return None
        return Image.open(io.BytesIO(base["image"])).convert("RGB")
    except Exception:
        return None


def extract_pdf(pdf_bytes):
    if fitz is None:
        raise HTTPException(
            status_code=503,
            detail="PDF support is not installed. Run `pip install -r requirements.txt` and restart.",
        )

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not open the PDF: {exc}")

    if doc.needs_pass:
        doc.close()
        raise HTTPException(status_code=422, detail="Password-protected PDFs are not supported.")

    page_count = min(len(doc), MAX_PDF_PAGES)
    text_parts = []
    images = []

    try:
        for index in range(page_count):
            page = doc.load_page(index)
            page_text = page.get_text("text").strip()

            if page_text:
                text_parts.append(f"[Page {index + 1}]\n{page_text}")

                for embedded in page.get_images(full=True):
                    if len(images) >= MAX_PDF_IMAGES:
                        break
                    extracted = extract_embedded_image(doc, embedded[0])
                    if extracted is not None:
                        images.append(extracted)
            else:
                try:
                    rendered = render_page(page)
                except Exception:
                    continue

                if OCR_ENABLED and pytesseract is not None:
                    try:
                        ocr_text = pytesseract.image_to_string(rendered, lang=OCR_LANG).strip()
                    except Exception:
                        ocr_text = ""
                    if ocr_text:
                        text_parts.append(f"[Page {index + 1} OCR]\n{ocr_text}")

                if len(images) < MAX_PDF_IMAGES:
                    images.append(rendered)
    finally:
        doc.close()

    extracted_text = "\n\n".join(text_parts)[:MAX_PDF_TEXT_CHARS]
    return extracted_text, images, page_count


def build_pdf_prompt(extracted_text, image_count, page_count):
    parts = [
        "A medical report PDF was uploaded.",
        f"Pages processed: {page_count}.",
        f"Images attached: {image_count}.",
        "Analyze the report and respond with exactly these sections:",
        "1. Summary",
        "2. Findings",
        "3. Explanation in simple language",
        "Describe only what is present in the report and do not invent values.",
    ]

    if extracted_text:
        parts.append(f"Extracted report text:\n{extracted_text}")
    else:
        parts.append(
            "No readable text could be extracted. Use the attached page images if any. "
            "If nothing is readable, say so clearly."
        )

    return "\n\n".join(parts)


def generate_reply(prompt, images, system_prompt):
    import torch

    content = [{"type": "text", "text": prompt}]
    content.extend({"type": "image", "image": image} for image in images)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": [{"type": "text", "text": system_prompt}]})
    messages.append({"role": "user", "content": content})

    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(model.device)

    pixel_values = inputs.get("pixel_values")
    if pixel_values is not None:
        inputs["pixel_values"] = pixel_values.to(model.dtype)

    with torch.inference_mode():
        output_ids = model.generate(**inputs, max_new_tokens=MAX_NEW_TOKENS)

    new_tokens = output_ids[0][inputs["input_ids"].shape[-1]:]

    return processor.decode(new_tokens, skip_special_tokens=True).strip()


@app.post("/analyze")
async def analyze_medical_data(
    prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    pdf: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    mode: Optional[str] = Form(None),
    system_prompt: Optional[str] = Form(None),
):
    if model is None or processor is None:
        raise HTTPException(
            status_code=503,
            detail=load_error or "Local model is not loaded. Check the AI server logs.",
        )

    upload = pdf or file or image
    images = []
    extracted_text = ""
    page_count = 0

    if upload:
        data = await upload.read()
        content_type = (upload.content_type or "").lower()
        is_pdf = content_type == "application/pdf" or data.startswith(b"%PDF-")

        if is_pdf:
            extracted_text, images, page_count = extract_pdf(data)
            model_prompt = build_pdf_prompt(extracted_text, len(images), page_count)
        else:
            try:
                images = [Image.open(io.BytesIO(data)).convert("RGB")]
            except Exception:
                raise HTTPException(status_code=422, detail="Could not read the uploaded image.")
            model_prompt = prompt
    else:
        model_prompt = prompt

    try:
        reply = generate_reply(model_prompt, images, system_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

    if not reply:
        raise HTTPException(status_code=502, detail="The model returned an empty response.")

    return {
        "reply": reply,
        "pages": page_count,
        "has_extracted_text": bool(extracted_text),
        "image_count": len(images),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="127.0.0.1", port=8001)
