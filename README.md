# GPU Guard

Deterministic policy engine + hash-chained audit log for GPU provisioning.

## Features

- PolicyEngine integration (`@oxdeai/core`)
- Hash-chained tamper-evident audit
- SQLite persistence (WAL)
- Operator CLI for state/audit operations
- Policy/state export and import
- Reset, wipe, and init workflows

## Prerequisites

- Node.js 20+
- `pnpm`

## Quickstart

```bash
pnpm install
pnpm build
```

Optional env:

```bash
export OXDEAI_ACTION_TYPE=PROVISION
export COST_SCALE=100
export BUDGET_LIMIT_MINOR=500n
export PER_ACTION_CAP_MINOR=1000000n
```

## Operator Baseline

Use this minimum command model for consistent ops:

```bash
pnpm dev init --file policy.json
pnpm dev launch a100 us-east-1 --action PROVISION
pnpm dev audit --json
pnpm dev state --json
```

## CLI

Read commands:

- `pnpm dev audit [--json] [--tail <n>] [--db <path>]`
- `pnpm dev state [--json] [--db <path>]`
- `pnpm dev launch <type> <region> [--action <ActionType>] [--db <path>] [--agent <id>]`
- `pnpm dev demo <type> <region> [--action <ActionType>] [--db <path>] [--agent <id>]`

Operator commands:

- `pnpm dev init --file <path> [--db <path>]`
- `pnpm dev export-state --file <path> [--db <path>]`
- `pnpm dev import-state --file <path> [--db <path>]`
- `pnpm dev reset-state [--db <path>]`
- `pnpm dev reset-audit [--db <path>]`
- `pnpm dev wipe-db [--db <path>]`
- `pnpm dev allowlist-add <ActionType> [--db <path>]`
- `pnpm dev allowlist-rm <ActionType> [--db <path>]`
- `pnpm dev set-budget <limit> [--db <path>] [--agent <id>]`
- `pnpm dev reset-spent [--db <path>] [--agent <id>]`
- `pnpm dev set-velocity <windowSeconds> <maxActions> [--db <path>]`
- `pnpm dev reset-counters [--db <path>]`
- `pnpm dev killswitch global <on|off> [--db <path>]`
- `pnpm dev killswitch agent <agentId> <on|off> [--db <path>]`
- `pnpm dev rotate-period [--db <path>]`

## Notes

- `init --file ...` validates JSON before wiping DB.
- Imported state/policy JSON is normalized to the current runtime schema before persistence.
- Default DB path is `./.gpu-guard/gpu-guard.db` (overridable with `--db` or `GPU_GUARD_DB`).
