import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcrypt";

vi.mock("mongoose", () => ({
    default: { connection: { readyState: 1 } }
}));

vi.mock("../models/User.js", () => {
    const findOne = vi.fn();
    return { default: { findOne } };
});

const { default: User } = await import("../models/User.js");
const { default: authRoutes } = await import("../routes/auth.js");

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = {
            user: undefined,
            cookie: { maxAge: 0 },
            destroy: (cb) => cb && cb()
        };
        next();
    });
    app.use("/api/auth", authRoutes);
    return app;
};

describe("login does not leak account existence", () => {
    beforeEach(() => {
        User.findOne.mockReset();
    });

    it("returns the same generic error for an unknown email", async () => {
        User.findOne.mockResolvedValue(null);

        const res = await request(buildApp())
            .post("/api/auth/login")
            .send({ email: "nobody@example.com", password: "password123" })
            .expect(401);

        expect(res.body.error).toBe("Invalid email or password");
    });

    it("returns the same generic error for a wrong password", async () => {
        const passwordHash = await bcrypt.hash("correct-password", 10);
        User.findOne.mockResolvedValue({
            _id: { toString: () => "user-1" },
            email: "user@example.com",
            mobile: "9999999999",
            password: passwordHash,
            role: "user",
            plan: "free",
            freeChatsRemaining: 5
        });

        const res = await request(buildApp())
            .post("/api/auth/login")
            .send({ email: "user@example.com", password: "wrong-password" })
            .expect(401);

        expect(res.body.error).toBe("Invalid email or password");
    });

    it("rejects malformed input with 400", async () => {
        const res = await request(buildApp())
            .post("/api/auth/login")
            .send({ email: "not-an-email", password: "" })
            .expect(400);

        expect(res.body.error).toBe("Invalid input");
    });
});
