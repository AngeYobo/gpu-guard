import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { GpuOrchestrator } from "../orchestrator/GpuOrchestrator.js";
import { RuntimeState } from "../state/RuntimeState.js";

type Flags = {
  json?: boolean;
  db?: string;
  agent?: string;
  yes?: boolean;
  action?: string;
  tail?: number;
  file?: string;
};

function usage() {
  console.log(`gpu-guard CLI

Operator Baseline:
  pnpm dev init --file <policy.json>
  pnpm dev launch <type> <region> --action <ActionType>
  pnpm dev audit --json
  pnpm dev state --json

Extended Usage:
  pnpm dev audit [--json] [--db <path>]
  pnpm dev state [--json] [--db <path>]
  pnpm dev launch <type> <region> [--action <ActionType>] [--db <path>] [--agent <id>]
  pnpm dev demo <type> <region> [--action <ActionType>] [--db <path>] [--agent <id>]

Operator:
  pnpm dev init --file <path> [--db <path>]
  pnpm dev export-state --file <path> [--db <path>]
  pnpm dev import-state --file <path> [--db <path>]
  pnpm dev reset-state [--db <path>]
  pnpm dev reset-audit [--db <path>]
  pnpm dev wipe-db [--db <path>]
  pnpm dev allowlist-add <ActionType> [--db <path>]
  pnpm dev allowlist-rm <ActionType> [--db <path>]
  pnpm dev set-budget <limit> [--db <path>] [--agent <id>]
  pnpm dev reset-spent [--db <path>] [--agent <id>]
  pnpm dev set-velocity <windowSeconds> <maxActions> [--db <path>]
  pnpm dev reset-counters [--db <path>]
  pnpm dev killswitch global <on|off> [--db <path>]
  pnpm dev killswitch agent <agentId> <on|off> [--db <path>]
  pnpm dev rotate-period [--db <path>]

Flags:
  --json            Print JSON only (machine-readable)
  --db <path>       Override DB path (default: ./.gpu-guard/gpu-guard.db or GPU_GUARD_DB env)
  --agent <id>      Override agent id (default: RuntimeState agent_id)
  --yes             Non-interactive confirmation (reserved)

Notes:
  ActionType literals (from OxDeAI-core):
    PAYMENT | PURCHASE | PROVISION | ONCHAIN_TX

Legacy env (still supported by your orchestrator code if you kept it):
  OXDEAI_ACTION_TYPE=PROVISION
  COST_SCALE=100
  BUDGET_LIMIT_MINOR=500n
  PER_ACTION_CAP_MINOR=1000000n
`);
}

function parseBigInt(input: string): bigint {
  const s = input.endsWith("n") ? input.slice(0, -1) : input;
  // throws if invalid -> desired
  return BigInt(s);
}

function parseFlags(argv: string[]): { args: string[]; flags: Flags } {
  const args: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args.push(a);
      continue;
    }

    if (a === "--json") {
      flags.json = true;
      continue;
    }
    if (a === "--yes") {
      flags.yes = true;
      continue;
    }
    if (a === "--db") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --db");
      flags.db = v;
      continue;
    }
    if (a === "--agent") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --agent");
      flags.agent = v;
      continue;
    }
    if (a === "--file") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --file");
      flags.file = v;
      continue;
    }
    if (a === "--action") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --action");
      flags.action = v;
      continue;
    }
    if (a === "--tail") {
      const v = argv[++i];
      if (!v) throw new Error("Missing value for --tail");
      flags.tail = Number(v);
      if (!Number.isFinite(flags.tail)) throw new Error("Invalid number for --tail");
      continue;
    }

    // allow --key=value style for common flags
    if (a.startsWith("--db=")) {
      flags.db = a.slice("--db=".length);
      continue;
    }
    if (a.startsWith("--agent=")) {
      flags.agent = a.slice("--agent=".length);
      continue;
    }
    if (a.startsWith("--action=")) {
      flags.action = a.slice("--action=".length);
      continue;
    }
    if (a.startsWith("--file=")) {
      flags.file = a.slice("--file=".length);
      continue;
    }
    if (a.startsWith("--json=")) {
      flags.json = a.slice("--json=".length) === "true";
      continue;
    }

    // ignore unknown flags? better to fail fast
    throw new Error(`Unknown flag: ${a}`);
  }

  return { args, flags };
}

function printJson(obj: unknown) {
  console.log(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v), 2));
}

function getCmd(args: string[]): string | null {
  return args[0] ?? null;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    usage();
    process.exit(2);
  }

  let parsed: { args: string[]; flags: Flags };
  try {
    parsed = parseFlags(argv);
  } catch (e: any) {
    console.error(e?.message ?? e);
    usage();
    process.exit(2);
    return;
  }

  const { args, flags } = parsed;
  const cmd = getCmd(args);
  if (!cmd) {
    usage();
    process.exit(2);
  }

  // Apply DB override via env (GpuOrchestrator reads GPU_GUARD_DB)
  if (flags.db) process.env["GPU_GUARD_DB"] = flags.db;

  const runtime = new RuntimeState(flags.agent);
  const orch = new GpuOrchestrator(runtime);

  // --- READ COMMANDS ---
  if (cmd === "audit") {
    if (flags.json) {
      const audit = orch.getAudit();
      if (typeof flags.tail === "number") {
        const n = Math.max(0, Math.floor(flags.tail));
        const evs = Array.isArray((audit as any).events) ? (audit as any).events : [];
        (audit as any).events = evs.slice(Math.max(0, evs.length - n));
      }
      printJson(audit);
    } else {
      orch.printAudit();
    }
    return;
  }

  if (cmd === "state") {
    if (flags.json) {
      printJson(orch.getState());
    } else {
      orch.printState();
    }
    return;
  }

  // --- OPERATOR COMMANDS ---
  if (cmd === "reset-state") {
    orch.resetState();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "reset-audit") {
    orch.resetAudit();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "wipe-db") {
    orch.wipeDb();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "allowlist-add") {
    const action = args[1];
    if (!action) {
      console.error("Missing ActionType");
      usage();
      process.exit(2);
    }
    orch.allowlistAddAction(action as any);
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "allowlist-rm") {
    const action = args[1];
    if (!action) {
      console.error("Missing ActionType");
      usage();
      process.exit(2);
    }
    orch.allowlistRemoveAction(action as any);
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "set-budget") {
    const limitStr = args[1];
    if (!limitStr) {
      console.error("Missing budget limit (bigint, e.g. 1000000n or 1000000)");
      usage();
      process.exit(2);
    }
    const limit = parseBigInt(limitStr);
    // If you implemented agentId override in orchestrator, pass flags.agent
    if ((orch as any).setBudgetLimit.length >= 2) (orch as any).setBudgetLimit(limit, flags.agent);
    else (orch as any).setBudgetLimit(limit);
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "reset-spent") {
    if ((orch as any).resetSpent.length >= 1) (orch as any).resetSpent(flags.agent);
    else (orch as any).resetSpent();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "set-velocity") {
    const w = args[1];
    const m = args[2];
    if (!w || !m) {
      console.error("Missing args: <windowSeconds> <maxActions>");
      usage();
      process.exit(2);
    }
    const windowSeconds = Number(w);
    const maxActions = Number(m);
    if (!Number.isFinite(windowSeconds) || !Number.isFinite(maxActions)) {
      console.error("Invalid numbers for set-velocity");
      process.exit(2);
    }
    orch.setVelocity(windowSeconds, maxActions);
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "reset-counters") {
    orch.resetCounters();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "killswitch") {
    const scope = args[1]; // global|agent
    if (!scope) {
      console.error("Missing scope: global|agent");
      usage();
      process.exit(2);
    }

    if (scope === "global") {
      const onOff = args[2];
      if (!onOff || (onOff !== "on" && onOff !== "off")) {
        console.error("Usage: killswitch global <on|off>");
        process.exit(2);
      }
      orch.setKillSwitchGlobal(onOff === "on");
      if (!flags.json) console.log("OK");
      return;
    }

    if (scope === "agent") {
      const agentId = args[2];
      const onOff = args[3];
      if (!agentId || !onOff || (onOff !== "on" && onOff !== "off")) {
        console.error("Usage: killswitch agent <agentId> <on|off>");
        process.exit(2);
      }
      orch.setKillSwitchAgent(agentId, onOff === "on");
      if (!flags.json) console.log("OK");
      return;
    }

    console.error("Invalid scope for killswitch (expected global|agent)");
    process.exit(2);
  }

  if (cmd === "rotate-period") {
    orch.rotatePeriod();
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "export-state") {
    const file = flags.file;
    if (!file) {
      console.error("Missing --file <path>");
      process.exit(2);
    }
    const json = orch.exportStateJson();
    writeFileSync(file, json + "\n", "utf8");
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "import-state") {
    const file = flags.file;
    if (!file) {
      console.error("Missing --file <path>");
      process.exit(2);
    }
    const text = readFileSync(file, "utf8");
    orch.importStateJson(text);
    if (!flags.json) console.log("OK");
    return;
  }

  if (cmd === "init") {
    const file = flags.file;
    if (!file) {
      console.error("Missing --file <path>");
      process.exit(2);
    }
    const text = readFileSync(file, "utf8");
    // Validate JSON before destructive wipe.
    JSON.parse(text);
    // Clean slate: state + audit
    orch.wipeDb();
    orch.importStateJson(text);
    if (!flags.json) console.log("OK");
    return;
  }



  // --- EXECUTION COMMANDS ---
  if (cmd === "launch" || cmd === "demo") {
    const gpuType = args[1];
    const region = args[2];
    if (!gpuType || !region) {
      usage();
      process.exit(2);
    }

    const actionType = flags.action;
    if (!actionType) {
      console.error("Missing action type. Provide --action <PAYMENT|PURCHASE|PROVISION|ONCHAIN_TX>.");
      process.exit(2);
    }

    await orch.launch(gpuType, region, actionType);

    if (cmd === "demo") {
      orch.printAudit();
      orch.printState();
    }
    return;
  }

  usage();
  process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
