import type { ActionType, State } from "@oxdeai/core";

export class RuntimeState {
  public readonly agent_id = "gpu-agent-1";
  public readonly policy_version = "v0.1";

  makeState(): State {
    const actionType = (process.env["OXDEAI_ACTION_TYPE"] ?? "SPEND") as ActionType;

    return {
      policy_version: this.policy_version,
      period_id: "day",
      kill_switch: { global: false, agents: {} },
      allowlists: {
        action_types: [actionType],
        assets: ["a100", "h100"],
        targets: ["us-east-1"]
      },
      budget: {
        budget_limit: { [this.agent_id]: 50000n },
        spent_in_period: { [this.agent_id]: 0n }
      },
      max_amount_per_action: { [this.agent_id]: 1000000n },
      velocity: {
        config: { window_seconds: 60, max_actions: 5 },
        counters: {}
      }
    };
  }
}
