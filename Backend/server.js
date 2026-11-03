// Backend/server.js
import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";

const PORT = process.env.PORT || 8080;
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
        console.error(`Login/signup will not work until MongoDB is reachable. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
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
