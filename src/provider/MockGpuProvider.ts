import type { GpuProvider } from "./GpuProvider.js";

export class MockGpuProvider implements GpuProvider {
  estimateHourlyCost(type: string, _region: string): number {
    // simple mock pricing
    if (type === "a100") return 3.2;  // $/hour
    if (type === "h100") return 5.0;  // $/hour
    return 1.0;
  }

  async launchInstance(type: string, region: string): Promise<string> {
    const id = `mock-${type}-${region}-${Date.now()}`;
    console.log(`Mock launching ${type} in ${region} => ${id}`);
    return id;
  }

  async terminateInstance(id: string): Promise<void> {
    console.log(`Mock terminating ${id}`);
  }
}
