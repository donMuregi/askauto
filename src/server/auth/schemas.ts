import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name as shown on your national ID.")
      .max(80, "Full name must be 80 characters or fewer."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim().min(9, "Enter a valid Kenyan mobile number."),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      error: "Accept the Terms of Use and Privacy Notice to continue.",
    }),
    turnstileToken: z.string().optional(),
    next: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const signInSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or Kenyan phone number."),
  password: z.string().min(1, "Enter your password."),
  keepSignedIn: z.boolean().default(true),
  turnstileToken: z.string().optional(),
  next: z.string().optional(),
});

export const verifyPhoneOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or phone number."),
  channel: z.enum(["auto", "sms"]).default("auto"),
  turnstileToken: z.string().optional(),
});

export const resetPasswordEmailSchema = z
  .object({
    token: z.string().min(16, "Reset link is invalid or expired."),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const resetPasswordPhoneSchema = z
  .object({
    phone: z.string().trim().min(9, "Enter your Kenyan phone number."),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit SMS code."),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name must be 80 characters or fewer."),
  locale: z.enum(["en"]).default("en"),
});

export const requestEmailChangeSchema = z.object({
  newEmail: z.string().trim().email("Enter a valid email address."),
  currentPassword: z.string().min(1, "Enter your current password."),
});

export const requestPhoneChangeSchema = z.object({
  newPhone: z.string().trim().min(9, "Enter a valid Kenyan mobile number."),
  currentPassword: z.string().min(1, "Enter your current password."),
});

export const confirmPhoneChangeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code sent to your new phone number."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const acceptInviteSchema = z
  .object({
    token: z.string().min(16, "Invitation link is invalid."),
    fullName: z.string().trim().min(2).max(80),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const mfaCodeSchema = z.object({
  code: z.string().trim().min(6, "Enter your 6-digit code or recovery code.").max(32),
  isRecoveryCode: z.boolean().default(false),
  next: z.string().optional(),
});
