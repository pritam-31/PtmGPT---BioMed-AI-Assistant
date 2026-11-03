import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createLimiter } from "../middleware/rateLimit.js";
import authRoutes from "../routes/auth.js";

const sessionUser = (overrides = {}) => ({
    id: "user-1",
    email: "user@example.com",
    role: "user",
    plan: "free",
    ...overrides
});

const buildApp = (user) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = {
            user: user ? sessionUser(user) : undefined,
            cookie: { maxAge: 0 },
            destroy: (cb) => cb && cb()
        };
        next();
    });
    app.use("/api/auth", authRoutes);
    return app;
};

describe("rate limiting", () => {
    it("returns 429 after the configured limit is exceeded", async () => {
        const app = express();
        app.use(createLimiter({ windowMs: 60000, limit: 2, message: "Too many requests" }));
        app.get("/", (req, res) => res.json({ ok: true }));

        await request(app).get("/").expect(200);
        await request(app).get("/").expect(200);
        const limited = await request(app).get("/").expect(429);
        expect(limited.body.error).toMatch(/too many/i);
    });
});

describe("upgrade authorization", () => {
    beforeEach(() => {
        delete process.env.PAYMENT_WEBHOOK_SECRET;
    });

    it("denies a normal user granting themselves a paid plan", async () => {
        const app = buildApp({ role: "user" });
        const res = await request(app)
            .post("/api/auth/upgrade")
            .send({ plan: "premium" })
            .expect(403);

        expect(res.body.error).toMatch(/administrator|verified payment/i);
    });

    it("returns 503 when the payment webhook secret is not configured", async () => {
        const app = buildApp({ role: "user" });
        const res = await request(app)
            .post("/api/auth/payment-webhook")
            .send({ email: "user@example.com", plan: "premium" })
            .expect(503);

        expect(res.body.error).toMatch(/not configured/i);
    });

    it("rejects a payment webhook with the wrong secret", async () => {
        process.env.PAYMENT_WEBHOOK_SECRET = "correct-secret";
        const app = buildApp({ role: "user" });
        const res = await request(app)
            .post("/api/auth/payment-webhook")
            .set("x-webhook-secret", "wrong-secret")
            .send({ email: "user@example.com", plan: "premium" })
            .expect(401);

        expect(res.body.error).toMatch(/invalid webhook/i);
        delete process.env.PAYMENT_WEBHOOK_SECRET;
    });
});
