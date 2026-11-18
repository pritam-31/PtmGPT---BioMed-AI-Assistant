// Backend/routes/chat.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Thread from "../models/Thread.js";
import User from "../models/User.js";
import getLocalMedicalResponse from "../utils/local_ai.js";
import { uploadFile } from "../utils/upload.js";
import { requireAuth, setSessionUser } from "../middleware/auth.js";
import { chatLimiter } from "../middleware/rateLimit.js";
import { detectImageType, MAX_IMAGE_BYTES } from "../utils/imageValidation.js";

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }
});

const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");
const isPdfBuffer = (buffer) => (
    Buffer.isBuffer(buffer)
    && buffer.length >= PDF_SIGNATURE.length
    && buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
);

const fetchAttachment = async (url) => {
    if (!url || !/^https?:\/\//i.test(url)) return null;

    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        const mimeType = detectImageType(buffer);

        if (mimeType) {
            return { buffer, mimeType, fileKind: "image" };
        }
        if (isPdfBuffer(buffer)) {
            return { buffer, mimeType: "application/pdf", fileKind: "pdf" };
        }
        return null;
    } catch {
        return null;
    }
};

const buildReply = async (thread, userIndex, content, modeOverride) => {
    const mode = modeOverride || (thread.messages[userIndex].mode === "openai" ? "openai" : "biomed");
    const attachment = await fetchAttachment(thread.messages[userIndex].imageUrl);
    const historyLimit = Number(process.env.OPENAI_HISTORY_MESSAGES) || 10;
    const history = thread.messages
        .slice(0, userIndex + 1)
        .map((entry, index) => ({
            role: entry.role,
            content: index === userIndex ? content : entry.content
        }))
        .slice(0, -1)
        .slice(-historyLimit);

    const reply = await getLocalMedicalResponse(
        content,
        attachment?.buffer || null,
        attachment ? "attachment" : null,
        attachment?.mimeType,
        mode,
        history,
        attachment?.fileKind || null
    );

    if (!reply) {
        const error = new Error("AI server returned an empty response");
        error.statusCode = 502;
        throw error;
    }

    return { reply, mode };
};

router.use(requireAuth);

router.get("/thread", async (req, res, next) => {
    try {
        const threads = await Thread.find({ ownerId: req.user.id }, { threadId: 1, title: 1 })
            .sort({ updatedAt: -1 })
            .lean();

        res.json(threads);
    } catch (err) {
        next(err);
    }
});

router.get("/thread/:threadId", async (req, res, next) => {
    try {
        const thread = await Thread.findOne({ threadId: req.params.threadId }).lean();

        if (!thread) {
            return res.status(404).json({ error: "thread not found" });
        }

        if (thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        res.json(thread.messages);
    } catch (err) {
        next(err);
    }
});

router.delete("/thread/:threadId", async (req, res, next) => {
    try {
        const deletedThread = await Thread.findOneAndDelete({
            threadId: req.params.threadId,
            ownerId: req.user.id
        });

        if (!deletedThread) {
            return res.status(404).json({ error: "thread not found" });
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.patch("/thread/:threadId/message/:messageId", async (req, res, next) => {
    try {
        const { content } = req.body;

        if (typeof content !== "string" || !content.trim()) {
            return res.status(400).json({ error: "Message content is required" });
        }

        if (content.length > 20000) {
            return res.status(400).json({ error: "Message is too long" });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.messageId)) {
            return res.status(400).json({ error: "Invalid message id" });
        }

        const thread = await Thread.findOne({ threadId: req.params.threadId });

        if (!thread) {
            return res.status(404).json({ error: "thread not found" });
        }

        if (thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        const messageIndex = thread.messages.findIndex(
            (entry) => entry._id.toString() === req.params.messageId
        );

        if (messageIndex === -1) {
            return res.status(404).json({ error: "message not found" });
        }

        const message = thread.messages[messageIndex];
        const nextContent = content.trim();

        if (message.role !== "user") {
            message.content = nextContent;
            message.editedAt = new Date();
            thread.updatedAt = new Date();
            await thread.save();
            return res.json({ success: true, messages: thread.messages, message });
        }

        const { reply: assistantReply, mode } = await buildReply(thread, messageIndex, nextContent);

        message.content = nextContent;
        message.editedAt = new Date();
        thread.messages = thread.messages.slice(0, messageIndex + 1);
        thread.messages.push({
            _id: new mongoose.Types.ObjectId(),
            role: "assistant",
            content: assistantReply,
            mode
        });
        thread.updatedAt = new Date();
        await thread.save();

        res.json({
            success: true,
            messages: thread.messages,
            message,
            reply: assistantReply,
            assistantMessageId: thread.messages[thread.messages.length - 1]._id
        });
    } catch (err) {
        if (err.statusCode) {
            if (err.statusCode >= 500) console.error("Message regeneration failed:", err.message);
            return res.status(err.statusCode).json({ error: err.message });
        }
        next(err);
    }
});

router.post("/thread/:threadId/message/:messageId/retry", async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.messageId)) {
            return res.status(400).json({ error: "Invalid message id" });
        }

        const thread = await Thread.findOne({ threadId: req.params.threadId });

        if (!thread) {
            return res.status(404).json({ error: "thread not found" });
        }

        if (thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        const messageIndex = thread.messages.findIndex(
            (entry) => entry._id.toString() === req.params.messageId
        );

        if (messageIndex === -1) {
            return res.status(404).json({ error: "message not found" });
        }

        let userIndex = messageIndex;

        if (thread.messages[messageIndex].role !== "user") {
            userIndex = -1;

            for (let index = messageIndex - 1; index >= 0; index -= 1) {
                if (thread.messages[index].role === "user") {
                    userIndex = index;
                    break;
                }
            }

            if (userIndex === -1) {
                return res.status(400).json({ error: "No user message to retry" });
            }
        }

        const { reply, mode } = await buildReply(
            thread,
            userIndex,
            thread.messages[userIndex].content
        );

        const assistantMessage = {
            _id: thread.messages[messageIndex].role === "assistant"
                ? thread.messages[messageIndex]._id
                : new mongoose.Types.ObjectId(),
            role: "assistant",
            content: reply,
            mode
        };

        thread.messages = thread.messages.slice(0, userIndex + 1);
        thread.messages.push(assistantMessage);
        thread.updatedAt = new Date();
        await thread.save();

        res.json({
            success: true,
            messages: thread.messages,
            reply,
            assistantMessageId: assistantMessage._id
        });
    } catch (err) {
        if (err.statusCode) {
            if (err.statusCode >= 500) console.error("Message retry failed:", err.message);
            return res.status(err.statusCode).json({ error: err.message });
        }
        next(err);
    }
});

router.delete("/thread/:threadId/message/:messageId", async (req, res, next) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.messageId)) {
            return res.status(400).json({ error: "Invalid message id" });
        }

        const thread = await Thread.findOne({ threadId: req.params.threadId });

        if (!thread) {
            return res.status(404).json({ error: "thread not found" });
        }

        if (thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        const messageIndex = thread.messages.findIndex(
            (entry) => entry._id.toString() === req.params.messageId
        );

        if (messageIndex === -1) {
            return res.status(404).json({ error: "message not found" });
        }

        const deletedMessageIds = [req.params.messageId];
        const nextMessage = thread.messages[messageIndex + 1];

        if (thread.messages[messageIndex].role === "user" && nextMessage?.role === "assistant") {
            deletedMessageIds.push(nextMessage._id.toString());
            thread.messages.splice(messageIndex + 1, 1);
        }

        thread.messages.splice(messageIndex, 1);
        thread.updatedAt = new Date();
        await thread.save();

        res.json({ success: true, messages: thread.messages, deletedMessageIds });
    } catch (err) {
        next(err);
    }
});

router.post("/chat", chatLimiter, upload.single("image"), async (req, res, next) => {
    const { threadId, message, mode } = req.body;
    const file = req.file;
    const selectedMode = mode === "biomed" ? "biomed" : "openai";

    if (!threadId || (!message && !file)) {
        return res.status(400).json({ error: "missing required fields" });
    }

    try {
        const detectedImageType = file ? detectImageType(file.buffer) : null;
        const fileIsImage = Boolean(detectedImageType);
        const fileIsPdf = Boolean(file && !fileIsImage && isPdfBuffer(file.buffer));

        if (file && !fileIsImage && !fileIsPdf) {
            return res.status(422).json({
                error: "Unsupported file. Upload an image (PNG, JPEG, WebP) or a PDF report."
            });
        }

        if (fileIsImage) {
            if (file.buffer.length > MAX_IMAGE_BYTES) {
                return res.status(413).json({ error: "Image is too large. Maximum size is 5 MB." });
            }
            file.mimetype = detectedImageType;
        }

        if (fileIsPdf) {
            file.mimetype = "application/pdf";
        }

        // PDF reports are analyzed by the local MedGemma pipeline.
        const effectiveMode = fileIsPdf ? "biomed" : selectedMode;

        const dbUser = await User.findById(req.user.id);
        if (!dbUser) {
            return res.status(401).json({ error: "User session invalid" });
        }

        if (dbUser.plan === "free" && dbUser.freeChatsRemaining <= 0) {
            return res.status(402).json({ error: "Free chat limit exceeded. Please upgrade." });
        }

        // Check thread ownership before uploading anything so a user cannot
        // push files into storage for a thread they do not own.
        let thread = await Thread.findOne({ threadId });

        if (thread && thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        let finalImageUrl = null;

        // Store the uploaded medical image or report in Cloudinary for UI display.
        if (file) {
            const uploadResult = await uploadFile(file.buffer, file.originalname);
            finalImageUrl = uploadResult.url;
        }

        const userMessageData = {
            role: "user",
            content: message || (fileIsPdf ? "Medical report uploaded" : "Medical image uploaded"),
            imageUrl: finalImageUrl,
            mode: effectiveMode
        };

        if (!thread) {
            thread = new Thread({
                ownerId: req.user.id,
                threadId,
                title: message || "Medical Analysis",
                messages: [userMessageData]
            });
        } else {
            thread.messages.push(userMessageData);
        }

        const userMessageDoc = thread.messages[thread.messages.length - 1];

        const historyLimit = Number(process.env.OPENAI_HISTORY_MESSAGES) || 10;
        const history = thread.messages
            .slice(0, -1)
            .slice(-historyLimit)
            .map((entry) => ({ role: entry.role, content: entry.content }));

        const assistantReply = await getLocalMedicalResponse(
            message,
            (fileIsImage || fileIsPdf) ? file.buffer : null,
            (fileIsImage || fileIsPdf) ? file.originalname : null,
            fileIsImage ? file.mimetype : fileIsPdf ? "application/pdf" : undefined,
            effectiveMode,
            history,
            fileIsPdf ? "pdf" : fileIsImage ? "image" : null
        );

        if (!assistantReply) {
            const error = new Error("AI server returned an empty response");
            error.statusCode = 502;
            throw error;
        }

        thread.messages.push({ role: "assistant", content: assistantReply, mode: effectiveMode });
        const assistantMessageDoc = thread.messages[thread.messages.length - 1];
        thread.updatedAt = new Date();

        await thread.save();

        if (dbUser.plan === "free") {
            dbUser.freeChatsRemaining = Math.max(0, dbUser.freeChatsRemaining - 1);
            await dbUser.save();
            setSessionUser(req, dbUser);
        }

        res.json({
            reply: assistantReply,
            imageUrl: finalImageUrl,
            user: req.session.user,
            userMessageId: userMessageDoc._id,
            assistantMessageId: assistantMessageDoc._id
        });
    } catch (err) {
        if (err.statusCode && err.statusCode < 500) {
            return res.status(err.statusCode).json({ error: err.message });
        }

        if (err.statusCode) {
            console.error("Chat failed:", err.message);
            return res.status(err.statusCode).json({ error: err.message });
        }

        next(err);
    }
});

export default router;
