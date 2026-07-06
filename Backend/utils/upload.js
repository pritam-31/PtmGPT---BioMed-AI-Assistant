import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import "dotenv/config";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadImage = async (fileBuffer, originalName, mimeType) => {
    return new Promise((resolve) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "chat_image" },
            (error, result) => {
                if (error) {
                    console.error("Cloudinary upload failed, falling back to local storage.");

                    // Fallback: Save to loacal disk
                    const uploadDir = path.join(process.cwd(), "uploads");
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    };

                    const fileName = `${Date.now()}-${originalName.replace(/\s+/g, "_")}`;
                    const filePath = path.join(uploadDir, fileName);
                    fs.writeFileSync(filePath, fileBuffer);

                    // Return local URL and base64 for OpenAI
                    const base64Image = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
                    resolve({
                        url: `/uploads/${fileName}`,
                        openAiUrl: base64Image //OpenAI needs base64, if url is localhost
                    });
                } else {
                    // Success: Return Cloudinary secure URL for both
                    resolve({
                        url: result.secure_url,
                        openAiUrl: result.secure_url
                    });
                }
            }
        );
        uploadStream.end(fileBuffer);
    });
};
