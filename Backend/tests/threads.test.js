import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../models/Thread.js", () => ({
    default: {
        findOne: vi.fn(),
        find: vi.fn(),
        findOneAndDelete: vi.fn()
    }
}));

const { default: Thread } = await import("../models/Thread.js");
const { default: chatRoutes } = await import("../routes/chat.js");

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.session = {
            user: {
                id: "user-1",
                email: "user@example.com",
                role: "user",
                plan: "free",
                freeChatsRemaining: 5
            },
            cookie: { maxAge: 0 }
        };
        next();
    });
    app.use("/api", chatRoutes);
    return app;
};

describe("thread ownership", () => {
    beforeEach(() => {
        Thread.findOne.mockReset();
    });

    it("returns 403 when a user requests another user's thread", async () => {
        Thread.findOne.mockReturnValue({
            lean: async () => ({
                ownerId: { toString: () => "other-user" },
                messages: []
            })
        });

        const res = await request(buildApp())
            .get("/api/thread/some-thread")
            .expect(403);

        expect(res.body.error).toMatch(/not authorized/i);
    });

    it("returns the messages for the owner", async () => {
        Thread.findOne.mockReturnValue({
            lean: async () => ({
                ownerId: { toString: () => "user-1" },
                messages: [{ role: "user", content: "hi" }]
            })
        });

        const res = await request(buildApp())
            .get("/api/thread/some-thread")
            .expect(200);

        expect(res.body).toEqual([{ role: "user", content: "hi" }]);
    });
});
