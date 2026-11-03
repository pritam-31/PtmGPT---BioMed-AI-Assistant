import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";

export const createLimiter = ({ windowMs, limit, message }) => rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message }
});

export const apiLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: isTest ? 1000 : 120,
    message: "Too many requests. Please slow down and try again shortly."
});

export const authLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: isTest ? 1000 : 10,
    message: "Too many authentication attempts. Please try again later."
});

export const chatLimiter = createLimiter({
    windowMs: 60 * 1000,
    limit: isTest ? 1000 : 30,
    message: "Too many chat requests. Please slow down."
});
