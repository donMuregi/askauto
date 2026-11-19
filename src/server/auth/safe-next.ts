export function safeNext(url: string | null | undefined, fallback = "/apply"): string {
  if (!url) return fallback;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\") || /[\r\n]/.test(trimmed)) return fallback;
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
