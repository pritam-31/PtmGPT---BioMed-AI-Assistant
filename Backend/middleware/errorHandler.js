import multer from "multer";

export const notFound = (req, res) => {
    res.status(404).json({ error: "Not found" });
};

export const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "Image is too large. Maximum size is 5 MB." });
        }

        return res.status(400).json({ error: "Invalid file upload" });
    }

    const status = Number(err.status || err.statusCode) || 500;
    const isProduction = process.env.NODE_ENV === "production";

    if (status >= 500) {
        console.error("Unhandled error:", err);
        return res.status(status).json({
            error: isProduction ? "Internal server error" : err.message || "Internal server error"
        });
    }

    return res.status(status).json({ error: err.message || "Request failed" });
};
