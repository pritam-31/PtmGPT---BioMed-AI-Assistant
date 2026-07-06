import fetch from "node-fetch";
import "dotenv/config";

const getOpenAI_APIResponse = async (message, imageUrl = null) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is missing in .env");
    }

    let prompt = message?.trim() || "";
    if (imageUrl) {
        const imagePrompt = message
            ? `${message.trim()}\n\nPlease analyze the following image and explain any medical findings: ${imageUrl}`
            : `Please analyze the following medical image and describe what you observe: ${imageUrl}`;
        prompt = imagePrompt;
    }

    if (!prompt) {
        prompt = "Please provide medical analysis for the uploaded image.";
    }

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "gpt-5.4-mini",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ]
        })
    };

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", options);
        const data = await response.json();

        if (!response.ok) {
            console.error("OpenAI API returned non-ok status:", response.status, data);

            // Provide a clearer message for quota/billing errors so the frontend can show it
            if (response.status === 429 || data?.error?.type === "insufficient_quota") {
                return "OpenAI quota exceeded: please check your OpenAI account plan and billing details.";
            }

            throw new Error(data.error?.message || "OpenAI API request failed");
        }

        return data.choices?.[0]?.message?.content || "";
    } catch (err) {
        console.error("OpenAI request failed:", err);

        if (err.message?.includes("OPENAI_API_KEY is missing")) {
            return "OpenAI API key is not configured. Please add OPENAI_API_KEY to the backend .env file.";
        }

        if (imageUrl) {
            return "I received your medical image, but the AI service is unavailable right now. Please configure your OpenAI API key in Backend/.env or try again later.";
        }

        if (!message?.trim()) {
            return "I did not receive a prompt. Please ask your medical question again.";
        }

        if (/hi|hello|hey/i.test(message)) {
            return "Hello! I'm your local assistant fallback. I can't access the AI service at the moment, but I can still help with basic guidance. Please configure your OpenAI API key for full responses.";
        }

        return "I'm currently unable to access the AI service. Please check your OpenAI API key and network connection, then try again.";
    }
};

export default getOpenAI_APIResponse;
