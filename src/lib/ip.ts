function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const num = Number.parseInt(part, 10);
    if (num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  return result >>> 0;
}

function normalizeIp(rawIp: string): string {
  const trimmed = rawIp.trim();
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIp(ip);
  const [network, prefixStr] = cidr.trim().split("/");
  if (!network) return false;

  const ipInt = ipv4ToInt(normalizedIp);
  const netInt = ipv4ToInt(normalizeIp(network));

  if (ipInt !== null && netInt !== null) {
    const prefix = prefixStr !== undefined ? Number.parseInt(prefixStr, 10) : 32;
    if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = (~0 << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (netInt & mask);
  }

  // Exact match fallback for IPv6 addresses
  return normalizedIp.toLowerCase() === normalizeIp(network).toLowerCase();
}

export function isIpInAllowlist(ip: string | null | undefined, allowlist?: string[] | null): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  if (!ip) {
    return false;
  }
  return allowlist.some((cidr) => isIpInCidr(ip, cidr));
}
