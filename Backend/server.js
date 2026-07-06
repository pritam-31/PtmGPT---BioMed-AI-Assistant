// Backend/server.js
import express from "express";
import "dotenv/config";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import session from "express-session";
import chatRoutes from "./routes/chat.js";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 8080;
const DB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/test";
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 3;
const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 8000
};
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(express.json());
app.use(cors({
    origin: FRONTEND_ORIGINS,
    credentials: true
}));

// NEW: Serve local fallback images to the frontend
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use(session({
    name: "ptmgpt.sid",
    secret: process.env.SESSION_SECRET || "ptmgpt_session_secret_change_me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_MAX_AGE
    }
}));

app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);

const connectDB = async () => {
    try {
        await mongoose.connect(DB_URI, MONGO_OPTIONS);
        console.log("Connected with Database!");
    } catch (err) {
        console.error("Failed to connect with Db:", err.message);
        console.error("Login/signup will not work until MongoDB is reachable.");
    }
}

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on ${PORT}`);
    });
};

startServer();
