// Backend/routes/chat.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Thread from "../models/Thread.js";
import User from "../models/User.js";
import getLocalMedicalResponse from "../utils/local_ai.js"; // <--- Updated Import
import { uploadImage } from "../utils/upload.js"; // Tumhara Cloudinary/Local fallback
import { requireAuth, setSessionUser } from "../middleware/auth.js";

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB limit
});

router.use(requireAuth);

router.get("/thread", async (req, res) => {
    try {
        const threads = await Thread.find({ ownerId: req.user.id }, { threadId: 1, title: 1 })
            .sort({ updatedAt: -1 })
            .lean();

        res.json(threads);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "failed to fetch threads" });
    }
});

router.get("/thread/:threadId", async (req, res) => {
    try {
        const thread = await Thread.findOne({
            threadId: req.params.threadId,
            ownerId: req.user.id
        }).lean();

        if (!thread) {
            return res.status(404).json({ error: "thread not found" });
        }

        res.json(thread.messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "failed to fetch thread" });
    }
});

router.delete("/thread/:threadId", async (req, res) => {
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
        console.error(err);
        res.status(500).json({ error: "failed to delete thread" });
    }
});

router.post("/chat", upload.single('image'), async (req, res) => {
    const { threadId, message, mode } = req.body;
    const file = req.file;
    const selectedMode = mode === "biomed" ? "biomed" : "openai";

    if (!threadId || (!message && !file)) {
        return res.status(400).json({ error: "missing required fields" });
    }

    try {
        const dbUser = await User.findById(req.user.id);
        if (!dbUser) {
            return res.status(401).json({ error: "User session invalid" });
        }

        if (dbUser.plan === "free" && dbUser.freeChatsRemaining <= 0) {
            return res.status(402).json({ error: "Free chat limit exceeded. Please upgrade." });
        }

        let finalImageUrl = null;

        // 1. Save Image for UI display (Cloudinary or local /uploads)
        if (file) {
            const uploadResult = await uploadImage(file.buffer, file.originalname, file.mimetype);
            finalImageUrl = uploadResult.url; 
        } 

        // 2. Database logic
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

        // 3. SEND TO LOCAL PYTHON SERVER
        const fileBuffer = file ? file.buffer : null;
        const fileName = file ? file.originalname : null;
        
        const assistantReply = await getLocalMedicalResponse(message, fileBuffer, fileName, file?.mimetype, selectedMode);

        if (!assistantReply) {
            throw new Error("AI server returned an empty response");
        }

        // 4. Save & Respond
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
        console.error("Chat failed:", err);
        res.status(502).json({ error: err.message || "AI response failed" });
    }
});

export default router;
