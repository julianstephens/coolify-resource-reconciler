// Export types and functions for use as a library
export {
  parseManifest,
  safeParseManifest,
  manifestSchema,
  resourceSchema,
  healthCheckSchema,
} from "./manifest.js";
export type { Manifest, Resource, HealthCheck } from "./manifest.js";

export { CoolifyClient } from "./coolify.js";
export type {
  CoolifyApplication,
  CoolifyEnvVar,
  CoolifyApiError,
  CreateDockerImageAppOptions,
  UpdateAppOptions,
} from "./coolify.js";

export { Reconciler, parseEnvFile, envVarsToCoolifyFormat } from "./reconciler.js";
export type { ReconcileResourceResult, ReconcileResult, ReconcilerOptions } from "./reconciler.js";

export { createLogger } from "./logger.js";
export type { Logger } from "./logger.js";

export { parseEnv, envSchema } from "./env.js";
export type { Env } from "./env.js";
