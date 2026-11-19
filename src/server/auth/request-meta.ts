import { headers } from "next/headers";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent");
  return { ip, userAgent };
}
