# GPU Guard

GPU Guard is a thin product layer that uses **OxDeAI-core** as a deterministic, fail-closed
economic authorization engine for autonomous GPU infrastructure actions.

## What it enforces (today)
- Budget caps (per period)
- Per-action caps
- Velocity limits (runaway loop protection)
- Kill switch (global / per-agent)
- Replay protection (nonce)
- Cryptographic authorization + hash-chained audit log (via OxDeAI-core)

## Units
This repo uses **minor units** for money (e.g., cents) represented as `bigint`.
- Example: $500.00/day budget with `COST_SCALE=100` => `BUDGET_LIMIT_MINOR=50000`

## Quickstart
From `gpu-guard/`:

1) Choose a valid `ActionType` from your local OxDeAI-core:
```bash
cat ../OxDeAI-core/packages/core/src/types/intent.ts

