import { describe, it, expect, vi, afterEach } from "vitest";
import { isEmergencyMessage, EMERGENCY_MESSAGE } from "../utils/emergency.js";
import getLocalMedicalResponse, { getLocalHealth } from "../utils/local_ai.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("emergency guard", () => {
    it("detects common emergency phrases", () => {
        expect(isEmergencyMessage("I have severe chest pain")).toBe(true);
        expect(isEmergencyMessage("I am having thoughts of self-harm")).toBe(true);
        expect(isEmergencyMessage("my friend took an overdose")).toBe(true);
        expect(isEmergencyMessage("I cannot breathe properly")).toBe(true);
    });

    it("does not flag ordinary questions", () => {
        expect(isEmergencyMessage("What causes a common cold?")).toBe(false);
        expect(isEmergencyMessage("Tell me about vitamin D")).toBe(false);
    });

    it("provides an emergency message that points to emergency services", () => {
        expect(EMERGENCY_MESSAGE).toMatch(/emergency/i);
        expect(EMERGENCY_MESSAGE).toMatch(/112/);
    });
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
