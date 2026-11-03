import { z } from "zod";

const normalizeEmail = (value) => value.trim().toLowerCase();

const email = z.string().trim().min(1, "Email is required").transform(normalizeEmail).pipe(z.email("Enter a valid email address"));

const password = z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long");

const mobile = z
    .string()
    .trim()
    .min(7, "Enter a valid mobile number")
    .max(20, "Enter a valid mobile number")
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, "Enter a valid mobile number");

export const signupSchema = z.object({
    email,
    mobile,
    password
});

export const loginSchema = z.object({
    email,
    password: z.string().min(1, "Password is required").max(128, "Password is too long")
});

export const upgradeSchema = z.object({
    plan: z.enum(["free", "cloud", "premium"]),
    userId: z.string().trim().optional()
});

export const webhookSchema = z.object({
    email,
    plan: z.enum(["free", "cloud", "premium"])
});

export const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            error: "Invalid input",
            details: result.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message
            }))
        });
    }

    req.body = result.data;
    next();
};
