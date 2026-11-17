import "dotenv/config";
import getOpenAI_APIResponse from "./openai.js";
import { MEDICAL_SYSTEM_PROMPT } from "../prompts/medicalSystemPrompt.js";

const LOCAL_AI_URL = process.env.LOCAL_AI_URL || "http://127.0.0.1:8001/analyze";
const LOCAL_HEALTH_URL = process.env.LOCAL_AI_HEALTH_URL || "http://127.0.0.1:8001/health";
const LOCAL_AI_TIMEOUT_MS = Number(process.env.LOCAL_AI_TIMEOUT_MS) || 300000;
const HEALTH_TTL_MS = 3000;

let healthCache = { at: 0, value: null };

export const getLocalHealth = async ({ force = false } = {}) => {
    if (!force && healthCache.value && Date.now() - healthCache.at < HEALTH_TTL_MS) {
        return healthCache.value;
    }

    let value;

    try {
        const response = await fetch(LOCAL_HEALTH_URL, { signal: AbortSignal.timeout(2500) });
        const data = await response.json().catch(() => ({}));
        value = {
            reachable: response.ok,
            status: data.status || (response.ok ? "ok" : "error"),
            backend: data.backend || "unknown",
            model_loaded: Boolean(data.model_loaded),
            model_id: data.model_id || null,
            load_error: data.load_error || null
        };
    } catch (err) {
        value = {
            reachable: false,
            status: "unreachable",
            backend: "none",
            model_loaded: false,
            model_id: null,
            load_error: "Local AI server is not reachable"
        };
    }

    healthCache = { at: Date.now(), value };
    return value;
};

const postAnalyze = async (message, fileBuffer, fileName, mimeType, systemPrompt, fileKind = null) => {
    const formData = new FormData();
    const isPdf = fileKind === "pdf";

    formData.append("prompt", message || (isPdf
        ? "Analyze this medical report PDF. Provide a summary, findings, and an explanation."
        : "Analyze this image in a medical context"));
    formData.append("mode", "biomed");
    formData.append("system_prompt", systemPrompt);

    if (fileBuffer) {
        const blob = new Blob([fileBuffer], { type: mimeType || (isPdf ? "application/pdf" : "image/jpeg") });
        formData.append(isPdf ? "pdf" : "image", blob, fileName || (isPdf ? "report.pdf" : "upload.jpg"));
    }

    let response;

    try {
        response = await fetch(LOCAL_AI_URL, {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(LOCAL_AI_TIMEOUT_MS)
        });
    } catch (err) {
        const error = new Error("Local model server is not reachable. Please start it or use Cloud mode.");
        error.statusCode = 503;
        error.cause = err;
        throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data.detail || data.error || "Local model request failed");
        error.statusCode = response.status === 503 ? 503 : 502;
        throw error;
    }

    const reply = data.reply || data.generated_text || data.text;

    if (typeof reply !== "string" || !reply.trim()) {
        const error = new Error("Local model returned an empty response");
        error.statusCode = 502;
        throw error;
    }

    return reply.trim();
};

const getLocalMedicalResponse = async (
    message,
    fileBuffer,
    fileName,
    mimeType,
    mode = "openai",
    history = [],
    fileKind = null
) => {
    if (fileKind === "pdf") {
        const health = await getLocalHealth();

        if (!health.reachable || !health.model_loaded) {
            const error = new Error(
                "PDF analysis needs the local MedGemma model. Start the Python AI server and try again."
            );
            error.statusCode = 503;
            throw error;
        }

        return postAnalyze(message, fileBuffer, fileName, mimeType, MEDICAL_SYSTEM_PROMPT, "pdf");
    }

    if (mode === "biomed") {
        const health = await getLocalHealth();

        if (!health.reachable || !health.model_loaded) {
            const error = new Error(
                "Local (BioMed) model is not running. Start the Python AI server (see \"Local model setup (MedGemma 4B)\" in README.md) or switch to Cloud mode."
            );
            error.statusCode = 503;
            throw error;
        }

        return postAnalyze(message, fileBuffer, fileName, mimeType, MEDICAL_SYSTEM_PROMPT, fileKind);
    }

    return getOpenAI_APIResponse({
        message,
        fileBuffer,
        mimeType,
        history,
        systemPrompt: MEDICAL_SYSTEM_PROMPT
    });
};

export { LOCAL_AI_URL, LOCAL_HEALTH_URL };
export default getLocalMedicalResponse;
