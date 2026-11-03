const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const startsWith = (buffer, signature) => (
    buffer.length >= signature.length
    && signature.every((byte, index) => buffer[index] === byte)
);

/**
 * Detect the real image type from magic bytes. Returns one of the allowed
 * mimetypes, or null if the file is not a PNG/JPEG/WebP image.
 */
export const detectImageType = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return null;
    }

    if (startsWith(buffer, PNG_SIGNATURE)) {
        return "image/png";
    }

    if (startsWith(buffer, JPEG_SIGNATURE)) {
        return "image/jpeg";
    }

    if (startsWith(buffer, RIFF) && startsWith(buffer.subarray(8), WEBP)) {
        return "image/webp";
    }

    return null;
};

export const validateImageBuffer = (buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, status: 400, error: "Image file is empty" };
    }

    if (buffer.length > MAX_IMAGE_BYTES) {
        return { ok: false, status: 413, error: "Image is too large. Maximum size is 5 MB." };
    }

    const detected = detectImageType(buffer);

    if (!detected) {
        return { ok: false, status: 422, error: "Unsupported image. Upload a PNG, JPEG, or WebP file." };
    }

    return { ok: true, mimeType: detected };
};
