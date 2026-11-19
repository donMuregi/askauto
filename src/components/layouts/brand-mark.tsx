import Image from "next/image";
import Link from "next/link";
import { BRAND_NAME, PARTNER_MARK, PLATFORM_NAME } from "@/lib/constants";
import logo from "../../../public/brand/askautoparts-logo.png";

interface BrandMarkProps {
  href?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

const logoHeights = { sm: "h-10", md: "h-12", lg: "h-16" } as const;

export function BrandMark({ href = "/", size = "md", showTagline = true }: BrandMarkProps) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
    >
      <Image
        src={logo}
        alt={BRAND_NAME}
        priority
        className={`${logoHeights[size]} w-auto`}
      />
      {showTagline ? (
        <span className="hidden flex-col border-l border-border pl-3 leading-tight sm:flex">
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            {PLATFORM_NAME}
          </span>
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            with {PARTNER_MARK}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
