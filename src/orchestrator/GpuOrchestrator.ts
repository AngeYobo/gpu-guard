import type { ActionType, Intent, State } from "@oxdeai/core";
import { PolicyEngine } from "@oxdeai/core";

import type { GpuProvider } from "../provider/GpuProvider.js";
import { MockGpuProvider } from "../provider/MockGpuProvider.js";
import { RuntimeState } from "../state/RuntimeState.js";
import { SqliteStore } from "../state/SqliteStore.js";

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function envBigInt(name: string, fallback: bigint): bigint {
  const v = process.env[name];
  if (!v || v.trim() === "") return fallback;
  const s = v.endsWith("n") ? v.slice(0, -1) : v;
  return BigInt(s);
}

export class GpuOrchestrator {
  private readonly runtime: RuntimeState;
  private readonly provider: GpuProvider;

  private readonly engine: PolicyEngine;
  private state: State;

  private readonly store: SqliteStore;

  private load(): State {
    return this.store.loadState() ?? this.state;
  }
  private save(s: State): void {
    this.store.saveState(s);
    this.state = s;
  }

  constructor(runtime: RuntimeState, provider?: GpuProvider) {
    this.runtime = runtime;
    this.provider = provider ?? new MockGpuProvider();

    const engine_secret = process.env["OXDEAI_ENGINE_SECRET"] ?? "dev-secret";
    this.engine = new PolicyEngine({
      policy_version: "v0.1",
      engine_secret,
      authorization_ttl_seconds: 120
    });

    const dbPath = process.env["GPU_GUARD_DB"] ?? "./.gpu-guard/gpu-guard.db";
    this.store = new SqliteStore(dbPath);

    // load persisted state, else default
    this.state = this.store.loadState() ?? this.runtime.makeState();
    // ensure persisted state exists
    this.store.saveState(this.state);
  }

  async launch(gpuType: string, region: string, actionTypeStr: string): Promise<void> {
    const action_type = actionTypeStr as ActionType;

    // hourly cost -> minor units (COST_SCALE=100 => cents)
    const COST_SCALE = Number(process.env["COST_SCALE"] ?? "100");
    const hourly = this.provider.estimateHourlyCost(gpuType, region);
    const costMinor = BigInt(Math.round(hourly * COST_SCALE));

    // overrides
    const budgetOverride = envBigInt("BUDGET_LIMIT_MINOR", 0n);
    const capOverride = envBigInt("PER_ACTION_CAP_MINOR", 0n);
    if (budgetOverride > 0n) this.state.budget.budget_limit[this.runtime.agent_id] = budgetOverride;
    if (capOverride > 0n) this.state.max_amount_per_action[this.runtime.agent_id] = capOverride;

    // optional dev helper: allowlist this action type
    const allowlistAction = process.env["ALLOWLIST_ACTION_TYPE"];
    if (allowlistAction) {
      const arr = (this.state.allowlists.action_types ??= []);
      if (!arr.includes(allowlistAction as any)) arr.push(allowlistAction as any);
    }

    const intent: Intent = {
      intent_id: crypto.randomUUID(),
      agent_id: this.runtime.agent_id,
      action_type,
      amount: costMinor,
      asset: gpuType,
      target: region,
      timestamp: nowSec(),
      metadata_hash: "0x0",
      nonce: BigInt(Math.floor(Math.random() * 1_000_000)),
      signature: "v0.1-placeholder"
    };

    const out = this.engine.evaluate(intent, this.state);

    // persist audit events for this run (even on DENY)
    const auditAny = this.engine.audit as unknown as Record<string, unknown>;
    const drainFn = auditAny["drain"];
    const snapshotFn = auditAny["snapshot"];
    const entriesFn = auditAny["entries"];

    if (typeof drainFn !== "function" && typeof snapshotFn !== "function" && typeof entriesFn !== "function") {
      throw new Error("PolicyEngine.audit does not expose drain(), snapshot() nor entries()");
    }

    const rawEvents =
      typeof drainFn === "function"
        ? (drainFn as (this: unknown) => unknown).call(this.engine.audit)
        : typeof snapshotFn === "function"
          ? (snapshotFn as (this: unknown) => unknown).call(this.engine.audit)
          : (entriesFn as (this: unknown) => unknown).call(this.engine.audit);

    const events = Array.isArray(rawEvents) ? rawEvents : [];
    this.store.appendAuditEvents(events as any);

    // IMPORTANT: persist state even on DENY (velocity / counters may have been updated)
    this.store.saveState(this.state);

    if (out.decision === "DENY") {
      console.log("DENY:", out.reasons);
      return;
    }

    console.log("ALLOW:", out.authorization.authorization_id);
    await this.provider.launchInstance(gpuType, region);
  }

  allowlistAddAction(action: ActionType): void {
    const s = this.load();
    const arr = (s.allowlists.action_types ??= []);
    if (!arr.includes(action)) arr.push(action);
    this.save(s);
  }

  allowlistRemoveAction(action: ActionType): void {
    const s = this.load();
    s.allowlists.action_types = (s.allowlists.action_types ?? []).filter((a) => a !== action);
    this.save(s);
  }

  setBudgetLimit(limit: bigint, agentId?: string): void {
    const s = this.load();
    const agent = agentId ?? this.runtime.agent_id;
    s.budget.budget_limit[agent] = limit;
    this.save(s);
  }

  resetSpent(agentId?: string): void {
    const s = this.load();
    const agent = agentId ?? this.runtime.agent_id;
    s.budget.spent_in_period[agent] = 0n;
    this.save(s);
  }

  setVelocity(windowSeconds: number, maxActions: number): void {
    const s = this.load();
    s.velocity.config.window_seconds = windowSeconds;
    s.velocity.config.max_actions = maxActions;
    this.save(s);
  }

  resetCounters(): void {
    const s = this.load();
    s.velocity.counters = {};
    this.save(s);
  }

  setKillSwitchGlobal(on: boolean): void {
    const s = this.load();
    s.kill_switch.global = on;
    this.save(s);
  }

  setKillSwitchAgent(agentId: string, on: boolean): void {
    const s = this.load();
    s.kill_switch.agents[agentId] = on;
    this.save(s);
  }

  rotatePeriod(): void {
    const s = this.load();
    // new period: reset spent + counters, keep limits + allowlists + policy_version
    s.budget.spent_in_period = { [this.runtime.agent_id]: 0n };
    s.velocity.counters = {};
    this.save(s);
  }

  getState(): State {
    return this.store.loadState() ?? this.state;
  }

  getAudit(): { headHash: string; verify: boolean; events: unknown[] } {
    return {
      headHash: this.store.auditHeadHash(),
      verify: this.store.auditVerify(),
      events: this.store.auditSnapshot() as unknown[]
    };
  }

  setState(state: State): void {
    this.store.saveState(state);
    this.state = state;
  }

  exportStateJson(): string {
    const s = this.getState();
    return JSON.stringify(
      s,
      (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v),
      2
    );
  }

  importStateJson(jsonText: string): void {
    const parsed = JSON.parse(jsonText);

    const revive = (v: any): any => {
      if (typeof v === "string" && /^[0-9]+n$/.test(v)) return BigInt(v.slice(0, -1));
      if (Array.isArray(v)) return v.map(revive);
      if (v && typeof v === "object") {
        const out: any = {};
        for (const k of Object.keys(v)) out[k] = revive(v[k]);
        return out;
      }
      return v;
    };

    const state = revive(parsed) as State;
    this.setState(state);
  }


  resetAudit(): void {
    this.store.resetAudit();
    console.log("Audit has been reset.");
  }

  wipeDb(): void {
    this.store.wipeAll();
    // recreate fresh persisted state after wipe
    this.state = this.runtime.makeState();
    this.store.saveState(this.state);
    console.log("DB has been wiped.");
  }


  printState(): void {
    // Always print persisted state (source of truth)
    const s = this.store.loadState() ?? this.state;
    const json = JSON.stringify(
      s,
      (_k, v) => (typeof v === "bigint" ? `${v.toString()}n` : v),
      2
    );
    console.log(json);
  }

  printAudit(): void {
    console.log("Audit headHash:", this.store.auditHeadHash());
    console.log("Audit verify():", this.store.auditVerify());
    console.log("Audit events:", JSON.stringify(this.store.auditSnapshot(), null, 2));
  }

  resetState(): void {
    const current = this.store.loadState() ?? this.state;

    const newState: State = {
      ...current,

      allowlists: {
        ...current.allowlists,
        action_types: ["PROVISION"]
      },

      budget: {
        budget_limit: {
          [this.runtime.agent_id]: 0n
        },
        spent_in_period: {
          [this.runtime.agent_id]: 0n
        }
      },

      velocity: {
        ...current.velocity,
        counters: {}
      }
    };

    this.store.saveState(newState);
    this.state = newState;

    console.log("State has been reset.");
  }
}
