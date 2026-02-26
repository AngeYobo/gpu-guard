# GPU Guard

Deterministic policy engine + hash-chained audit log for GPU provisioning.

## Features

- PolicyEngine integration (OxDeAI-core)
- Hash-chained tamper-evident audit
- SQLite persistence (WAL)
- Operator CLI
- Policy export/import
- Reset / wipe / init

## Example

pnpm dev init --file policy.json
pnpm dev launch a100 us-east-1 --action PROVISION
pnpm dev audit --json

