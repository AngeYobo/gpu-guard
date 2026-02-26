import fs from "node:fs";
import path from "node:path";
import type { State } from "@oxdeai/core";

function atomicWriteFileSync(filePath: string, data: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

export function loadState(filePath: string): State | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return null;

    // BigInt revive: strings ending with 'n' OR plain bigint-looking strings? we store with 'n'
    const obj = JSON.parse(raw, (_k, v) => {
      if (typeof v === "string" && /^[0-9]+n$/.test(v)) return BigInt(v.slice(0, -1));
      return v;
    });
    return obj as State;
  } catch {
    return null;
  }
}

export function saveState(filePath: string, state: State) {
  const json = JSON.stringify(
    state,
    (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v),
    2
  );
  atomicWriteFileSync(filePath, json);
}
