import type { ActionType, State } from "@oxdeai/core";

export class RuntimeState {
  public readonly agent_id: string;
  public readonly policy_version: string;

  constructor(agent_id = "gpu-agent-1", policy_version = "v0.1") {
    this.agent_id = agent_id;
    this.policy_version = policy_version;
  }

  makeState(): State {
    const actionType = (
      process.env["OXDEAI_ACTION_TYPE"] ?? "PROVISION"
    ) as ActionType;

    const state = {
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
      },

      replay: {
        window_seconds: 3600,
        max_nonces_per_agent: 1000,
        nonces: {}
      },

      concurrency: {
        max_concurrent: { [this.agent_id]: 2 },
        active: {},
        active_auths: {}
      },

      recursion: {
        max_depth: { [this.agent_id]: 3 }
      },

      tool_limits: {
        window_seconds: 60,
        max_calls: { [this.agent_id]: 1000 },
        max_calls_by_tool: {},
        calls: {}
      }
    };

    // Keep runtime fields compatible across @oxdeai/core variants whose State type
    // may include/exclude module sections like replay/concurrency/tool_limits.
    return state as unknown as State;
  }
}
