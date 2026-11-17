import { v2 as cloudinary } from "cloudinary";
import "dotenv/config";

const getConfig = () => ({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadFile = (fileBuffer, originalName) => {
    const config = getConfig();

    if (!config.cloud_name || !config.api_key || !config.api_secret) {
        const error = new Error(
            "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
        );
        error.statusCode = 503;
        return Promise.reject(error);
    }

    cloudinary.config(config);

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: "chat_uploads",
                resource_type: "auto",
                use_filename: true,
                unique_filename: true
            },
            (error, result) => {
                if (error) {
                    const uploadError = new Error("Cloudinary upload failed. Please try again.");
                    uploadError.statusCode = 502;
                    uploadError.cause = error;
                    return reject(uploadError);
                }

                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    resourceType: result.resource_type
                });
            }
        );

        uploadStream.end(fileBuffer);
    });
};
