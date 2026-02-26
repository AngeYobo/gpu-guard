declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
