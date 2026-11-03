import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import crypto from "crypto";
import User from "../models/User.js";
import { setSessionUser, requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate, signupSchema, loginSchema, upgradeSchema, webhookSchema } from "../middleware/validate.js";

const router = express.Router();
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 3;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const requireDatabase = (res) => {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({
            error: "Database is not connected. Check MongoDB Atlas Network Access/IP whitelist."
        });
        return false;
    }

    return true;
};

const isAdmin = (user) => (
    user?.role === "admin" || ADMIN_EMAILS.includes((user?.email || "").toLowerCase())
);

const planChatAllowance = (plan) => {
    if (plan === "cloud") return 9999;
    if (plan === "premium") return 999999;
    return 28;
};

const safeCompare = (provided, expected) => {
    const providedBuffer = Buffer.from(String(provided || ""));
    const expectedBuffer = Buffer.from(String(expected || ""));

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

// SIGNUP ROUTE
router.post("/signup", authLimiter, validate(signupSchema), async (req, res, next) => {
    const { email, mobile, password } = req.body;

    try {
        if (!requireDatabase(res)) return;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            email,
            mobile,
            password: hashedPassword
        });
        await newUser.save();

        const safeUser = setSessionUser(req, newUser);
        req.session.cookie.maxAge = SESSION_MAX_AGE;

        res.status(201).json({
            message: "User created successfully!",
            user: safeUser
        });
    } catch (err) {
        next(err);
    }
});

// LOGIN ROUTE
router.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
    const { email, password } = req.body;

    try {
        if (!requireDatabase(res)) return;

        const user = await User.findOne({ email });

        // Deliberately identical response for unknown user and wrong password
        // to avoid leaking which emails are registered.
        const genericError = { error: "Invalid email or password" };

        if (!user) {
            return res.status(401).json(genericError);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json(genericError);
        }

        const safeUser = setSessionUser(req, user);
        req.session.cookie.maxAge = SESSION_MAX_AGE;

        res.json({
            message: "Logged in successfully",
            user: safeUser
        });
    } catch (err) {
        next(err);
    }
});

router.get("/me", (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    res.json({
        user: req.session.user,
        expiresAt: req.session.cookie?.expires || null
    });
});

router.post("/logout", (req, res) => {
    if (!req.session) {
        return res.json({ message: "Logged out" });
    }

    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: "Failed to log out" });
        }

        res.clearCookie("ptmgpt.sid", {
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production"
        });
        res.json({ message: "Logged out" });
    });
});

// Admin-only plan management. Normal users can no longer grant themselves a plan.
// To bootstrap an admin, set `role: "admin"` on the user in MongoDB, or add the
// user's email to ADMIN_EMAILS in the backend environment.
router.post("/upgrade", requireAuth, validate(upgradeSchema), async (req, res, next) => {
    if (!isAdmin(req.user)) {
        return res.status(403).json({
            error: "Upgrade requires an administrator or a verified payment."
        });
    }

    const { plan, userId } = req.body;

    try {
        if (!requireDatabase(res)) return;

        const targetId = userId || req.user.id;
        const user = await User.findById(targetId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.plan = plan;
        user.freeChatsRemaining = planChatAllowance(plan);
        user.upgradedAt = plan === "free" ? null : new Date();
        await user.save();

        if (targetId === req.user.id) {
            const safeUser = setSessionUser(req, user);
            return res.json({ message: "Subscription updated", user: safeUser });
        }

        res.json({ message: "Subscription updated", userId: targetId, plan });
    } catch (err) {
        next(err);
    }
});

// Stub payment webhook. A real payment provider must sign requests; this stub
// only checks a shared secret and is a clearly marked TODO.
router.post("/payment-webhook", validate(webhookSchema), async (req, res, next) => {
    const configuredSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!configuredSecret) {
        return res.status(503).json({ error: "Payment webhook is not configured." });
    }

    if (!safeCompare(req.get("x-webhook-secret"), configuredSecret)) {
        return res.status(401).json({ error: "Invalid webhook signature." });
    }

    try {
        if (!requireDatabase(res)) return;

        // TODO: verify the payment with the provider (signature, amount, status)
        // before granting a plan. This stub trusts the caller after the shared
        // secret check and must not be used in production as-is.
        const { email, plan } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.plan = plan;
        user.freeChatsRemaining = planChatAllowance(plan);
        user.upgradedAt = plan === "free" ? null : new Date();
        await user.save();

        res.json({ ok: true, email, plan });
    } catch (err) {
        next(err);
    }
});

export default router;
