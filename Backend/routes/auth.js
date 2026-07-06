import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../models/User.js";
import { setSessionUser, requireAuth } from "../middleware/auth.js";

const router = express.Router();
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 3;

const requireDatabase = (res) => {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({
            error: "Database is not connected. Check MongoDB Atlas Network Access/IP whitelist."
        });
        return false;
    }

    return true;
};

// SIGNUP ROUTE
router.post("/signup", async (req, res) => {
    const { email, mobile, password } = req.body;
    try {
        if (!requireDatabase(res)) return;

        if (!email || !mobile || !password) {
            return res.status(400).json({ error: "Email, mobile and password are required" });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }

        // Password hashing with salt (10 rounds)
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
        console.error("Signup failed:", err);
        res.status(500).json({ error: "Error creating user" });
    }
});

// LOGIN ROUTE
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!requireDatabase(res)) return;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Compare given password with hashed password in DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const safeUser = setSessionUser(req, user);
        req.session.cookie.maxAge = SESSION_MAX_AGE;

        res.json({
            message: "Logged in successfully",
            user: safeUser
        });
    } catch (err) {
        console.error("Login failed:", err);
        res.status(500).json({ error: "Server error" });
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

router.post("/upgrade", requireAuth, async (req, res) => {
    const { plan } = req.body;
    const validPlans = ["cloud", "premium"];
    if (!validPlans.includes(plan)) {
        return res.status(400).json({ error: "Invalid plan selected" });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.plan = plan;
        user.freeChatsRemaining = plan === "cloud" ? 9999 : 999999;
        user.upgradedAt = new Date();
        await user.save();

        const safeUser = setSessionUser(req, user);
        res.json({ message: "Subscription updated", user: safeUser });
    } catch (err) {
        console.error("Upgrade failed:", err);
        res.status(500).json({ error: "Failed to update subscription" });
    }
});

export default router;
