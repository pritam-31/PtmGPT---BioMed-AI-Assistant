import { describe, it, expect } from "vitest";
import {
    detectImageType,
    validateImageBuffer,
    MAX_IMAGE_BYTES
} from "../utils/imageValidation.js";

const pngBuffer = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpegBuffer = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webpBuffer = () => {
    const header = Buffer.from("RIFF");
    const size = Buffer.from([0x24, 0x00, 0x00, 0x00]);
    const format = Buffer.from("WEBP");
    return Buffer.concat([header, size, format, Buffer.from([0, 0, 0, 0])]);
};

describe("image magic-byte validation", () => {
    it("detects PNG, JPEG, and WebP signatures", () => {
        expect(detectImageType(pngBuffer())).toBe("image/png");
        expect(detectImageType(jpegBuffer())).toBe("image/jpeg");
        expect(detectImageType(webpBuffer())).toBe("image/webp");
    });

    it("rejects files that are not real images", () => {
        const result = validateImageBuffer(Buffer.from("this is not an image at all"));
        expect(result.ok).toBe(false);
        expect(result.status).toBe(422);
    });

    it("rejects an empty buffer", () => {
        const result = validateImageBuffer(Buffer.alloc(0));
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
    });

    it("rejects images over the size limit", () => {
        const oversized = Buffer.concat([pngBuffer(), Buffer.alloc(MAX_IMAGE_BYTES)]);
        const result = validateImageBuffer(oversized);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(413);
    });

    it("accepts a valid PNG and reports its detected type", () => {
        const result = validateImageBuffer(pngBuffer());
        expect(result.ok).toBe(true);
        expect(result.mimeType).toBe("image/png");
    });
});
