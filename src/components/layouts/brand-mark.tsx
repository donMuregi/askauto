import Link from "next/link";
import { BRAND_NAME, PARTNER_MARK, PLATFORM_NAME } from "@/lib/constants";

export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand text-xs font-bold text-brand-foreground">
        AAP
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">{BRAND_NAME}</span>
        <span className="text-[11px] font-medium text-accent">
          {PLATFORM_NAME} | {PARTNER_MARK}
        </span>
      </span>
    </Link>
  );
}
