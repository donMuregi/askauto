"use client";

import { getPasswordStrength } from "@/lib/password-policy";

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = getPasswordStrength(password);
  const colors = [
    "bg-destructive",
    "bg-destructive",
    "bg-brand",
    "bg-accent",
    "bg-success",
  ];

  return (
    <div className="space-y-1 pt-1" aria-live="polite">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full ${idx < score ? colors[score] : "bg-border"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Password strength: {label}</p>
    </div>
  );
}
