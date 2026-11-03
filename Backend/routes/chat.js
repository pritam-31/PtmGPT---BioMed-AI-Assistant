// Backend/routes/chat.js
import express from "express";
import multer from "multer";
import Thread from "../models/Thread.js";
import User from "../models/User.js";
import getLocalMedicalResponse from "../utils/local_ai.js";
import { uploadImage } from "../utils/upload.js";
import { requireAuth, setSessionUser } from "../middleware/auth.js";
import { chatLimiter } from "../middleware/rateLimit.js";
import { ALLOWED_IMAGE_MIME_TYPES, validateImageBuffer } from "../utils/imageValidation.js";
import { isEmergencyMessage, EMERGENCY_MESSAGE } from "../utils/emergency.js";

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
            const error = new Error("Unsupported image. Upload a PNG, JPEG, or WebP file.");
            error.statusCode = 422;
            return cb(error);
        }

        cb(null, true);
    }
});

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

router.post("/chat", chatLimiter, upload.single("image"), async (req, res, next) => {
    const { threadId, message, mode } = req.body;
    const file = req.file;
    const selectedMode = mode === "biomed" ? "biomed" : "openai";

    if (!threadId || (!message && !file)) {
        return res.status(400).json({ error: "missing required fields" });
    }

    try {
        if (file) {
            const imageCheck = validateImageBuffer(file.buffer);
            if (!imageCheck.ok) {
                return res.status(imageCheck.status).json({ error: imageCheck.error });
            }
            file.mimetype = imageCheck.mimeType;
        }

        const dbUser = await User.findById(req.user.id);
        if (!dbUser) {
            return res.status(401).json({ error: "User session invalid" });
        }

        if (dbUser.plan === "free" && dbUser.freeChatsRemaining <= 0) {
            return res.status(402).json({ error: "Free chat limit exceeded. Please upgrade." });
        }

        let finalImageUrl = null;

        // Save the image for UI display (Cloudinary or local /uploads).
        if (file) {
            const uploadResult = await uploadImage(file.buffer, file.originalname, file.mimetype);
            finalImageUrl = uploadResult.url;
        }

        let thread = await Thread.findOne({ threadId });

        if (thread && thread.ownerId.toString() !== req.user.id) {
            return res.status(403).json({ error: "Not authorized to access this thread" });
        }

        const userMessageData = {
            role: "user",
            content: message || "Medical image uploaded",
            imageUrl: finalImageUrl
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

        // Safety: never send a possible emergency to the model. Return a fixed
        // message urging the user to contact emergency services instead.
        if (isEmergencyMessage(message)) {
            thread.messages.push({ role: "assistant", content: EMERGENCY_MESSAGE });
            thread.updatedAt = new Date();
            await thread.save();

            return res.json({
                reply: EMERGENCY_MESSAGE,
                imageUrl: finalImageUrl,
                user: req.session.user,
                safety: "emergency"
            });
        }

        const historyLimit = Number(process.env.OPENAI_HISTORY_MESSAGES) || 10;
        const history = thread.messages
            .slice(0, -1)
            .slice(-historyLimit)
            .map((entry) => ({ role: entry.role, content: entry.content }));

        const assistantReply = await getLocalMedicalResponse(
            message,
            file ? file.buffer : null,
            file ? file.originalname : null,
            file?.mimetype,
            selectedMode,
            history
        );

        if (!assistantReply) {
            const error = new Error("AI server returned an empty response");
            error.statusCode = 502;
            throw error;
        }

        thread.messages.push({ role: "assistant", content: assistantReply });
        thread.updatedAt = new Date();

        await thread.save();

        if (dbUser.plan === "free") {
            dbUser.freeChatsRemaining = Math.max(0, dbUser.freeChatsRemaining - 1);
            await dbUser.save();
            setSessionUser(req, dbUser);
        }

        res.json({ reply: assistantReply, imageUrl: finalImageUrl, user: req.session.user });
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
