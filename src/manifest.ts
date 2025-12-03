import { z } from "zod";

/**
 * Schema for health check configuration in a Coolify resource.
 */
export const healthCheckSchema = z.object({
  path: z.string().min(1).describe("Health check endpoint path"),
  port: z.string().regex(/^\d+$/, "Port must be a numeric string"),
  host: z.string().default("localhost").optional().describe("Optional host for health check"),
  method: z
    .literal(["GET", "POST"])
    .default("GET")
    .optional()
    .describe("HTTP method for health check"),
  scheme: z
    .literal(["http", "https"])
    .default("http")
    .optional()
    .describe("HTTP scheme for health check"),
  returnCode: z.number().default(200).optional().describe("Expected HTTP return code"),
  responseText: z.string().default("").optional().describe("Expected HTTP response text"),
  interval: z.number().default(60).optional().describe("Interval between health checks in seconds"),
  timeout: z.number().default(60).optional().describe("Timeout for each health check in seconds"),
  retries: z.number().default(5).optional().describe("Number of retries for each health check"),
  startPeriod: z
    .number()
    .default(0)
    .optional()
    .describe("Initial delay before starting health checks in seconds"),
});

/**
 * Schema for a single resource/application definition in the manifest.
 */
export const resourceSchema = z.object({
  /** Unique name for this application in Coolify */
  name: z.string().min(1).describe("Application name in Coolify"),
  /** Human-readable description */
  description: z.string().default(""),
  /** Docker image name (without tag), e.g., "ghcr.io/owner/repo/service" */
  dockerImageName: z.string().min(1).describe("Docker image name without tag"),
  /** Name of the GitHub secret containing the environment variables for this app */
  envSecretName: z.string().min(1).describe("Name of the GitHub secret for environment variables"),
  /** Domain(s) for the application, comma-separated if multiple */
  domains: z.string().default(""),
  /** Port(s) to expose, comma-separated if multiple */
  portsExposes: z.string().refine(
    (val) => {
      // Allow optional spaces around commas
      const parts = val.split(",").map((p) => p.trim());
      if (parts.length === 0) return false;
      return parts.every((p) => {
        const n = Number(p);
        // Must be integer, in range 1-65535
        return /^\d+$/.test(p) && n >= 1 && n <= 65535;
      });
    },
    {
      message: "Ports must be comma-separated numbers between 1 and 65535 (e.g. '8080, 443')",
    },
  ),
  /** Health check configuration */
  healthCheck: healthCheckSchema.optional(),
});

/**
 * Schema for the complete Coolify manifest file.
 */
export const manifestSchema = z.object({
  /** Coolify Project UUID */
  projectId: z.string().min(1).describe("Coolify Project UUID"),
  /** Coolify Destination UUID (Docker Engine) */
  destinationId: z.string().min(1).describe("Coolify Destination UUID"),
  /** Target environment name */
  environmentName: z.string().min(1).default("production"),
  /** Name of the GitHub secret containing the .env file */
  envFileSecretName: z.string().min(1).default("PRODUCTION_ENV_FILE"),
  /** Server UUID for Coolify */
  serverUuid: z.string().min(1).optional().describe("Coolify Server UUID"),
  /** Array of resource definitions */
  resources: z.array(resourceSchema).min(1, "At least one resource must be defined"),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

/**
 * Parses and validates a manifest object.
 * @throws {z.ZodError} if validation fails
 */
export function parseManifest(data: unknown): Manifest {
  return manifestSchema.parse(data);
}

/**
 * Safely parses a manifest, returning success/error result.
 */
export function safeParseManifest(data: unknown) {
  return manifestSchema.safeParse(data);
}
