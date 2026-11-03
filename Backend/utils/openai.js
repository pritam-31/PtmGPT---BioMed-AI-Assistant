import "dotenv/config";
import { MEDICAL_SYSTEM_PROMPT } from "../prompts/medicalSystemPrompt.js";

const API_URL = "https://api.openai.com/v1/chat/completions";

// OpenAI Cookbook: https://platform.openai.com/docs/guides/gpt/lesson-1-multimodal
// Vision input format: messages array with content parts of type "text" and "image_url"
// (data URL). See https://platform.openai.com/docs/api-reference/vision

// Verify the default model is available in your account before relying on it.
// Model availability changes over time; see the OpenAI models documentation.
// This default is unverified — confirm it matches your OpenAI plan.
const getModel = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

const buildUserContent = (message, fileBuffer, mimeType) => {
    const text = (message || "").trim();

    if (!fileBuffer) {
        return text || "Hello";
    }

    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${fileBuffer.toString("base64")}`;

    return [
        {
            type: "text",
            text: text || "Please describe this medical image in general terms. Do not provide a definitive diagnosis."
        },
        {
            type: "image_url",
            image_url: { url: dataUrl }
        }
    ];
};

/**
 * Call the OpenAI Chat Completions API.
 *
 * @param {object} options
 * @param {string} options.message user text
 * @param {Buffer|null} options.fileBuffer optional image bytes
 * @param {string|null} options.mimeType image mime type
 * @param {Array<{role:string, content:string}>} options.history prior messages
 * @param {string} options.systemPrompt safety system prompt
 */
const getOpenAI_APIResponse = async ({
    message,
    fileBuffer = null,
    mimeType = null,
    history = [],
    systemPrompt = MEDICAL_SYSTEM_PROMPT
} = {}) => {
    if (!process.env.OPENAI_API_KEY) {
        const error = new Error("Cloud mode is not configured. Set OPENAI_API_KEY in the backend environment.");
        error.statusCode = 503;
        throw error;
    }

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: buildUserContent(message, fileBuffer, mimeType) }
    ];

    let response;
    try {
        response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: getModel(),
                messages
            }),
            signal: AbortSignal.timeout(60000)
        });
    } catch (err) {
        const error = new Error("Could not reach the cloud AI provider. Check your network connection and try again.");
        error.statusCode = 503;
        error.cause = err;
        throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data?.error?.message || "Cloud AI request failed";
        const error = new Error(message);
        error.upstreamStatus = response.status;
        error.statusCode = response.status === 429 ? 503 : 502;
        throw error;
    }

    const reply = data.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
        const error = new Error("Cloud AI returned an empty response");
        error.statusCode = 502;
        throw error;
    }

    return reply.trim();
};

export default getOpenAI_APIResponse;
