import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true
    },
    mobile: { 
        type: String, 
        required: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true 
    }, // Yahan hashed password aayega
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    plan: {
        type: String,
        enum: ["free", "cloud", "premium"],
        default: "free"
    },
    freeChatsRemaining: {
        type: Number,
        default: 28
    },
    upgradedAt: {
        type: Date,
        default: null
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

export default mongoose.model("User", UserSchema);
