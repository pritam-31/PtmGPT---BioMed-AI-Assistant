import { describe, it, expect, vi, afterEach } from "vitest";
import getLocalMedicalResponse, { getLocalHealth } from "../utils/local_ai.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("local model 503 behaviour", () => {
    it("returns 503 when the local server is unreachable", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
        await getLocalHealth({ force: true });

        await expect(
            getLocalMedicalResponse("hello", null, null, null, "biomed")
        ).rejects.toMatchObject({ statusCode: 503 });
    });

    it("returns 503 when the local server is up but no model is loaded", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok", backend: "none", model_loaded: false })
        });
        await getLocalHealth({ force: true });

        await expect(
            getLocalMedicalResponse("hello", null, null, null, "biomed")
        ).rejects.toMatchObject({ statusCode: 503 });
    });
});
