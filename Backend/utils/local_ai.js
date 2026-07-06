import OpenAI from "openai";
import getOpenAI_APIResponse from "./openai.js";

const LOCAL_AI_URL = process.env.LOCAL_AI_URL || "http://127.0.0.1:8001/analyze";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const getLocalMedicalResponse = async (message, fileBuffer, fileName, mimeType, mode = "openai") => {
    // BioMed mode: forward to local FastAPI server (image+prompt)
    if (mode === "biomed") {
        const formData = new FormData();

        formData.append("prompt", message || "Analyze this image in a medical context");
        formData.append("mode", "biomed");

        if (fileBuffer) {
            // Node 18+ supports Blob; FormData in Node fetch supports it too.
            const imageBlob = new Blob([fileBuffer], { type: mimeType || "image/jpeg" });
            formData.append("image", imageBlob, fileName || "upload.jpg");
        }

        try {
            const response = await fetch(LOCAL_AI_URL, {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || data.error || "Local AI server failed");
            }

            const reply = data.reply || data.generated_text || data.text;

            if (typeof reply !== "string" || !reply.trim()) {
                throw new Error(data.error || "Local AI server returned an empty response");
            }

            return reply.trim();
        } catch (err) {
            console.error("Local AI Error:", err);
            throw err;
        }
    }

    // OpenAI mode: use a stable model (fallback to gpt-3.5-turbo to avoid restricted models)
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    try {
        // Build a simple, safe user prompt string. If an image exists, include a short note and base64.
        let userPrompt = (message && message.trim()) ? message.trim() : "Hello";
        if (fileBuffer) {
            const mime = mimeType || "image/jpeg";
            const base64Image = `data:${mime};base64,${fileBuffer.toString("base64")}`;
            // Include a concise marker that an image is attached. Avoid sending huge images when possible.
            userPrompt += `\n\n[Attached image - base64 data URL starts here]\n${base64Image}`;
        }

        // Prefer the new Responses API wrapper for structured multimodal inputs
        const reply = await getOpenAI_APIResponse(userPrompt, fileBuffer ? undefined : null);

        if (typeof reply !== "string" || !reply.trim()) {
            throw new Error("OpenAI returned an empty response");
        }

        return reply.trim();
    } catch (err) {
        console.error("OpenAI Error:", err);
        // Provide a clearer message for quota errors and attempt local fallback
        const status = err?.status || err?.response?.status;
        if (status === 429) {
            console.warn("OpenAI quota exceeded (429). Attempting local fallback to `LOCAL_AI_URL`.");

            // Try local fallback (best-effort). Reuse biomed POST flow.
            try {
                const fallbackForm = new FormData();
                fallbackForm.append("prompt", message || "Fallback: please analyze this prompt locally.");
                fallbackForm.append("mode", "biomed");
                if (fileBuffer) {
                    const imageBlob = new Blob([fileBuffer], { type: mimeType || "image/jpeg" });
                    fallbackForm.append("image", imageBlob, fileName || "upload.jpg");
                }

                const fallbackResp = await fetch(LOCAL_AI_URL, {
                    method: "POST",
                    body: fallbackForm,
                });

                const fallbackData = await fallbackResp.json();
                if (fallbackResp.ok && fallbackData) {
                    const reply = fallbackData.reply || fallbackData.generated_text || fallbackData.text;
                    if (typeof reply === "string" && reply.trim()) return reply.trim();
                }
            } catch (fbErr) {
                console.error("Local fallback failed:", fbErr);
            }

            throw new Error("OpenAI quota exceeded (429). Local fallback attempted and failed or returned empty. Check your OpenAI billing or set a different API key.");
        }

        // Surface other errors
        throw err;
    }
};

export default getLocalMedicalResponse;
