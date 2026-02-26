export interface GpuProvider {
  estimateHourlyCost(type: string, region: string): number;
  launchInstance(type: string, region: string): Promise<string>;
  terminateInstance(id: string): Promise<void>;
}
