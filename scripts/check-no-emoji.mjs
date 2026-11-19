import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "emails", "messages", "docs", "tests", "scripts", "drizzle"];
const skip = new Set(["node_modules", ".next", "dist", "coverage"]);
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
let failed = false;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs|json|md|css|sql|html|txt)$/.test(name)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (emoji.test(line)) {
            console.error(`${path}:${i + 1}: emoji found`);
            failed = true;
          }
        });
    }
  }
}

roots.forEach((r) => {
  try {
    walk(r);
  } catch {}
});
process.exit(failed ? 1 : 0);
