// Backend/server.js
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";

const PORT = process.env.PORT || 8080;
const USING_LOCAL_FALLBACK = !process.env.MONGODB_URI;
const DB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/test";
const MONGO_OPTIONS = {
    serverSelectionTimeoutMS: 8000
};
const RETRY_DELAY_MS = 10000;

const connectDB = async () => {
    try {
        await mongoose.connect(DB_URI, MONGO_OPTIONS);
        console.log("Connected with Database!");
    } catch (err) {
        console.error("Failed to connect with Db:", err.message);

        if (USING_LOCAL_FALLBACK) {
            console.error(
                "MONGODB_URI is not set (Backend/.env missing or empty). " +
                "The app is falling back to local MongoDB at 127.0.0.1:27017, " +
                "which is why login/signup returns 503. Set MONGODB_URI in Backend/.env to your MongoDB Atlas URI."
            );
        } else {
            console.error(
                "MONGODB_URI is set but the connection failed. Check the Atlas URI, DB user password, " +
                "and that this machine's public IP is allowed in Atlas Network Access."
            );
        }

        console.error(`Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        setTimeout(connectDB, RETRY_DELAY_MS);
    }
};

const startServer = () => {
    const app = createApp();

    app.listen(PORT, () => {
        console.log(`Server running on ${PORT}`);
    });

    connectDB();
};

startServer();
