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

vi.mock("../utils/local_ai.js", () => ({
    default: vi.fn(async () => "regenerated answer")
}));

const { default: Thread } = await import("../models/Thread.js");
const { default: getLocalMedicalResponse } = await import("../utils/local_ai.js");
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

describe("message edit and delete", () => {
    const messageId = "507f1f77bcf86cd799439011";
    const replyId = "507f1f77bcf86cd799439012";
    const messageUrl = `/api/thread/some-thread/message/${messageId}`;
    const replyUrl = `/api/thread/some-thread/message/${replyId}`;

    const mockThread = (ownerId = "user-1") => {
        const messages = [
            { _id: messageId, role: "user", content: "old question", mode: "biomed" },
            { _id: replyId, role: "assistant", content: "old answer", mode: "biomed" }
        ];
        const thread = {
            ownerId: { toString: () => ownerId },
            messages,
            save: vi.fn(async () => {})
        };
        Thread.findOne.mockReturnValue(thread);
        return { thread, messages };
    };

    beforeEach(() => {
        Thread.findOne.mockReset();
        getLocalMedicalResponse.mockReset();
        getLocalMedicalResponse.mockResolvedValue("regenerated answer");
    });

    it("regenerates the reply when a user message is edited", async () => {
        const { thread, messages } = mockThread();

        const res = await request(buildApp())
            .patch(messageUrl)
            .send({ content: "  new question  " })
            .expect(200);

        expect(res.body.reply).toBe("regenerated answer");
        expect(res.body.assistantMessageId).toBeTruthy();
        expect(getLocalMedicalResponse).toHaveBeenCalledWith(
            "new question", null, null, undefined, "biomed", [], null
        );
        expect(thread.messages).toHaveLength(2);
        expect(thread.messages[0].content).toBe("new question");
        expect(thread.messages[0].editedAt).toBeTruthy();
        expect(thread.messages[1].content).toBe("regenerated answer");
        expect(thread.save).toHaveBeenCalled();
    });

    it("regenerates through OpenAI when the edited message used cloud mode", async () => {
        const { messages } = mockThread();
        messages[0].mode = "openai";

        await request(buildApp())
            .patch(messageUrl)
            .send({ content: "new question" })
            .expect(200);

        expect(getLocalMedicalResponse).toHaveBeenCalledWith(
            "new question", null, null, undefined, "openai", [], null
        );
    });

    it("keeps later messages when an assistant message is edited", async () => {
        const { messages } = mockThread();

        const res = await request(buildApp())
            .patch(replyUrl)
            .send({ content: "corrected answer" })
            .expect(200);

        expect(res.body.reply).toBeUndefined();
        expect(getLocalMedicalResponse).not.toHaveBeenCalled();
        expect(messages).toHaveLength(2);
        expect(messages[1].content).toBe("corrected answer");
    });

    it("does not change anything when regeneration fails", async () => {
        const { thread, messages } = mockThread();
        getLocalMedicalResponse.mockRejectedValueOnce(
            Object.assign(new Error("AI down"), { statusCode: 503 })
        );

        const res = await request(buildApp())
            .patch(messageUrl)
            .send({ content: "new question" })
            .expect(503);

        expect(res.body.error).toBe("AI down");
        expect(messages[0].content).toBe("old question");
        expect(messages).toHaveLength(2);
        expect(thread.save).not.toHaveBeenCalled();
    });

    it("rejects editing a message in another user's thread", async () => {
        const { thread, messages } = mockThread("other-user");

        const res = await request(buildApp())
            .patch(messageUrl)
            .send({ content: "updated text" })
            .expect(403);

        expect(res.body.error).toMatch(/not authorized/i);
        expect(messages[0].content).toBe("old question");
        expect(getLocalMedicalResponse).not.toHaveBeenCalled();
        expect(thread.save).not.toHaveBeenCalled();
    });

    it("rejects an empty edit", async () => {
        mockThread();

        const res = await request(buildApp())
            .patch(messageUrl)
            .send({ content: "   " })
            .expect(400);

        expect(res.body.error).toMatch(/content is required/i);
    });

    it("returns 404 when the message does not exist in the thread", async () => {
        const { thread } = mockThread();
        thread.messages.length = 0;

        await request(buildApp())
            .patch(messageUrl)
            .send({ content: "updated text" })
            .expect(404);
    });

    it("deletes a user message together with its reply", async () => {
        const { thread, messages } = mockThread();

        const res = await request(buildApp())
            .delete(messageUrl)
            .expect(200);

        expect(res.body.deletedMessageIds).toEqual([messageId, replyId]);
        expect(messages).toHaveLength(0);
        expect(thread.save).toHaveBeenCalled();
    });

    it("keeps the user message when its reply is deleted", async () => {
        const { messages } = mockThread();

        const res = await request(buildApp())
            .delete(replyUrl)
            .expect(200);

        expect(res.body.deletedMessageIds).toEqual([replyId]);
        expect(messages).toHaveLength(1);
        expect(messages[0]._id).toBe(messageId);
    });

    it("rejects deleting a message in another user's thread", async () => {
        const { thread, messages } = mockThread("other-user");

        await request(buildApp())
            .delete(messageUrl)
            .expect(403);

        expect(messages).toHaveLength(2);
        expect(thread.save).not.toHaveBeenCalled();
    });

    it("rejects an invalid message id", async () => {
        await request(buildApp())
            .patch("/api/thread/some-thread/message/not-an-id")
            .send({ content: "updated text" })
            .expect(400);

        expect(Thread.findOne).not.toHaveBeenCalled();
    });
});

describe("message retry", () => {
    const messageId = "507f1f77bcf86cd799439011";
    const replyId = "507f1f77bcf86cd799439012";
    const retryUrl = (id) => `/api/thread/some-thread/message/${id}/retry`;

    const mockThread = (ownerId = "user-1") => {
        const messages = [
            { _id: messageId, role: "user", content: "original question", mode: "biomed" },
            { _id: replyId, role: "assistant", content: "old answer", mode: "biomed" }
        ];
        const thread = {
            ownerId: { toString: () => ownerId },
            messages,
            save: vi.fn(async () => {})
        };
        Thread.findOne.mockReturnValue(thread);
        return { thread };
    };

    beforeEach(() => {
        Thread.findOne.mockReset();
        getLocalMedicalResponse.mockReset();
        getLocalMedicalResponse.mockResolvedValue("regenerated answer");
    });

    it("resends a user message and replaces the reply", async () => {
        const { thread } = mockThread();

        const res = await request(buildApp())
            .post(retryUrl(messageId))
            .expect(200);

        expect(res.body.reply).toBe("regenerated answer");
        expect(res.body.messages).toHaveLength(2);
        expect(getLocalMedicalResponse).toHaveBeenCalledWith(
            "original question", null, null, undefined, "biomed", [], null
        );
        expect(thread.messages[0].content).toBe("original question");
        expect(thread.messages[1].content).toBe("regenerated answer");
        expect(thread.save).toHaveBeenCalled();
    });

    it("regenerates an assistant response in place", async () => {
        const { thread } = mockThread();

        const res = await request(buildApp())
            .post(retryUrl(replyId))
            .expect(200);

        expect(res.body.assistantMessageId).toBe(replyId);
        expect(thread.messages).toHaveLength(2);
        expect(thread.messages[1]._id).toBe(replyId);
        expect(thread.messages[1].content).toBe("regenerated answer");
    });

    it("rejects retry in another user's thread", async () => {
        const { thread } = mockThread("other-user");

        await request(buildApp())
            .post(retryUrl(messageId))
            .expect(403);

        expect(getLocalMedicalResponse).not.toHaveBeenCalled();
        expect(thread.save).not.toHaveBeenCalled();
    });

    it("rejects retry when no user message is available", async () => {
        const { thread } = mockThread();
        thread.messages = [{ _id: replyId, role: "assistant", content: "orphan" }];

        await request(buildApp())
            .post(retryUrl(replyId))
            .expect(400);

        expect(getLocalMedicalResponse).not.toHaveBeenCalled();
    });
});
