import type { ReactNode } from "react";
import { PARTNER_MARK, PLATFORM_NAME, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";
import { BrandMark } from "./brand-mark";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const highlights = [
  "Get your vehicle repaired now",
  "Your financing partner pays Ask AutoParts directly",
  "Repay over time, daily or through payroll",
];

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div>
          <BrandMark href="/" showTagline={false} />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
                {title}
              </h1>
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {SUPPORT_PHONE} · {SUPPORT_EMAIL}
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full border-[48px] border-foreground/5"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full border-[64px] border-white/15"
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
          {PLATFORM_NAME} · {PARTNER_MARK}
        </p>
        <div className="relative space-y-8">
          <h2 className="max-w-md text-4xl font-semibold leading-[1.1] tracking-tight text-foreground">
            Fix now.
            <br />
            Pay later.
          </h2>
          <ul className="space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] font-medium text-foreground/85">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs font-medium text-foreground/80">Ask AutoParts</p>
      </aside>
    </div>
  );
}
