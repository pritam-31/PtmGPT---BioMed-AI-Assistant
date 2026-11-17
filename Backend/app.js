import express from "express";
import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";
import { getLocalHealth } from "./utils/local_ai.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 3;
const DB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/test";
const INSECURE_SESSION_SECRETS = new Set([
    "ptmgpt_session_secret_change_me",
    "replace-with-a-long-random-string"
]);

const parseOrigins = () => (
    (process.env.FRONTEND_ORIGIN
        || "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);

const buildSessionStore = (isProduction) => {
    if (process.env.NODE_ENV === "test") {
        return undefined;
    }

    try {
        const store = MongoStore.create({
            mongoUrl: DB_URI,
            collectionName: "sessions",
            ttl: SESSION_MAX_AGE / 1000,
            autoRemove: "native"
        });

        // connect-mongo connects lazily. If MongoDB is unreachable its internal
        // promises reject, which would crash Node as an unhandled rejection.
        // Handle both the "error" event and the internal connection promises.
        const reportStoreError = (err) => {
            console.error("MongoDB session store error:", err?.message || err);
        };

        store.on("error", reportStoreError);
        store.clientP?.catch(reportStoreError);
        store.collectionP?.catch(reportStoreError);

        return store;
    } catch (err) {
        if (isProduction) {
            throw err;
        }

        console.warn("Could not create MongoDB session store, falling back to MemoryStore:", err.message);
        return undefined;
    }
};

export const createApp = () => {
    const app = express();
    const isProduction = process.env.NODE_ENV === "production";
    const sessionSecret = process.env.SESSION_SECRET;

    if (
        isProduction
        && (
            !sessionSecret
            || sessionSecret.length < 32
            || INSECURE_SESSION_SECRETS.has(sessionSecret)
        )
    ) {
        throw new Error(
            "SESSION_SECRET must be set to a strong value of at least 32 characters when NODE_ENV=production."
        );
    }

    if (!sessionSecret) {
        console.warn("SESSION_SECRET is not set. Using an insecure development-only default.");
    }

    if (isProduction) {
        app.set("trust proxy", 1);
    }

    app.use(helmet({
        crossOriginResourcePolicy: { policy: "cross-origin" }
    }));

    app.use(cors({
        origin: parseOrigins(),
        credentials: true
    }));

    app.use(express.json({ limit: "1mb" }));

    app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

    app.use(session({
        name: "ptmgpt.sid",
        secret: sessionSecret || "ptmgpt_session_secret_change_me",
        resave: false,
        saveUninitialized: false,
        rolling: true,
        store: buildSessionStore(isProduction),
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            maxAge: SESSION_MAX_AGE
        }
    }));

    app.get("/api/health", (req, res) => {
        const states = ["disconnected", "connected", "connecting", "disconnecting"];
        res.json({
            status: "ok",
            database: states[mongoose.connection.readyState] || "unknown",
            timestamp: new Date().toISOString()
        });
    });

    app.get("/api/ai/status", async (req, res) => {
        const local = await getLocalHealth();
        res.json({ local });
    });

    app.use("/api/auth", authRoutes);
    app.use("/api", apiLimiter, chatRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
};
