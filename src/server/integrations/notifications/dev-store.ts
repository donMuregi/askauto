import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { uuidv7 } from "uuidv7";

export interface DevOutboxEntry {
  id: string;
  channel: "email" | "sms";
  to: string;
  subject?: string;
  purpose?: string;
  bodyText: string;
  bodyHtml?: string;
  createdAt: string;
}

const OUTBOX_FILE = join(process.cwd(), ".next", "dev-outbox.json");
const memoryEntries: DevOutboxEntry[] = [];

function shouldPersistToFile(): boolean {
  return process.env.NODE_ENV !== "test";
}

export function recordDevOutboxEntry(
  entry: Omit<DevOutboxEntry, "id" | "createdAt">,
): DevOutboxEntry {
  const full: DevOutboxEntry = {
    ...entry,
    id: uuidv7(),
    createdAt: new Date().toISOString(),
  };

  if (!shouldPersistToFile()) {
    memoryEntries.unshift(full);
    return full;
  }

  try {
    const existing = listDevOutboxEntries();
    const updated = [full, ...existing].slice(0, 200);
    mkdirSync(dirname(OUTBOX_FILE), { recursive: true });
    writeFileSync(OUTBOX_FILE, JSON.stringify(updated, null, 2), "utf8");
  } catch {
    memoryEntries.unshift(full);
  }
  return full;
}

export function listDevOutboxEntries(): DevOutboxEntry[] {
  if (!shouldPersistToFile()) {
    return [...memoryEntries];
  }
  try {
    if (!existsSync(OUTBOX_FILE)) {
      return [...memoryEntries];
    }
    const raw = readFileSync(OUTBOX_FILE, "utf8");
    const parsed = JSON.parse(raw) as DevOutboxEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [...memoryEntries];
  }
}

export function clearDevOutboxEntries(): void {
  memoryEntries.length = 0;
  if (shouldPersistToFile() && existsSync(OUTBOX_FILE)) {
    try {
      writeFileSync(OUTBOX_FILE, "[]", "utf8");
    } catch {
      // Ignore cleanup failure in dev
    }
  }
}
