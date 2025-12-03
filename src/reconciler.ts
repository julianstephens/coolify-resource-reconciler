import { CoolifyClient, type CoolifyEnvVar } from "./coolify.js";
import type { Logger } from "./logger.js";
import type { Manifest, Resource } from "./manifest.js";

/**
 * Result of reconciling a single resource.
 */
export interface ReconcileResourceResult {
  name: string;
  action: "created" | "updated" | "unchanged" | "failed";
  uuid?: string;
  error?: string;
}

/**
 * Result of the full reconciliation.
 */
export interface ReconcileResult {
  success: boolean;
  resources: ReconcileResourceResult[];
  totalCreated: number;
  totalUpdated: number;
  totalFailed: number;
}

/**
 * Options for the reconciler.
 */
export interface ReconcilerOptions {
  manifest: Manifest;
  dockerTag: string;
  envSecrets?: Record<string, string>;
  serverUuid?: string;
}

/**
 * Parses a .env formatted string into key-value pairs.
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted value'
 * - Comments starting with #
 * - Empty lines
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Match KEY=value pattern
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2];

    // Handle quoted values and mismatched quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (
      (value.startsWith('"') && !value.endsWith('"')) ||
      (value.startsWith("'") && !value.endsWith("'"))
    ) {
      // Mismatched quotes detected, skip this line or document the behavior
      // Optionally, log a warning here if a logger is available
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Converts parsed env vars to Coolify format.
 */
export function envVarsToCoolifyFormat(envVars: Record<string, string>): CoolifyEnvVar[] {
  return Object.entries(envVars).map(([key, value]) => ({
    key,
    value,
    is_preview: false,
    is_literal: true,
    is_multiline: value.includes("\n"),
    is_shown_once: false,
  }));
}

/**
 * Reconciles resources defined in the manifest with Coolify.
 */
export class Reconciler {
  private readonly client: CoolifyClient;
  private readonly logger: Logger;
  private readonly options: ReconcilerOptions;

  constructor(client: CoolifyClient, logger: Logger, options: ReconcilerOptions) {
    this.client = client;
    this.logger = logger;
    this.options = options;
  }

  /**
   * Reconciles all resources in the manifest.
   */
  async reconcile(): Promise<ReconcileResult> {
    const { manifest, dockerTag, envSecrets = {} } = this.options;
    const results: ReconcileResourceResult[] = [];
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    this.logger.info(
      {
        projectId: manifest.projectId,
        environmentName: manifest.environmentName,
        resourceCount: manifest.resources.length,
        dockerTag,
      },
      "Starting reconciliation",
    );

    // Check if the environment exists
    const environment = await this.client.findEnvironmentByName(
      manifest.projectId,
      manifest.environmentName,
    );

    if (!environment) {
      this.logger.error(
        {
          projectId: manifest.projectId,
          environmentName: manifest.environmentName,
        },
        "Target environment does not exist in Coolify project",
      );
      return {
        success: false,
        resources: manifest.resources.map((r) => ({
          name: r.name,
          action: "failed",
          error: "Target environment does not exist",
        })),
        totalCreated: 0,
        totalUpdated: 0,
        totalFailed: manifest.resources.length,
      };
    }

    this.logger.info(
      { environmentName: manifest.environmentName },
      "Environment exists, will update resources as needed",
    );

    // Determine server UUID
    const serverUuid = this.options.serverUuid ?? manifest.serverUuid;
    if (!serverUuid) {
      this.logger.error({}, "Server UUID is required but not provided in manifest or options");
      return {
        success: false,
        resources: [],
        totalCreated: 0,
        totalUpdated: 0,
        totalFailed: manifest.resources.length,
      };
    }

    // Process each resource
    for (const resource of manifest.resources) {
      try {
        // Get env vars for this specific resource
        const envFileContent = envSecrets[resource.envSecretName];
        let envVars: CoolifyEnvVar[] = [];
        if (envFileContent) {
          const parsed = parseEnvFile(envFileContent);
          envVars = envVarsToCoolifyFormat(parsed);
          this.logger.info(
            { resource: resource.name, envVarCount: envVars.length },
            "Parsed environment variables for resource",
          );
        } else {
          this.logger.warn(
            { resource: resource.name, secretName: resource.envSecretName },
            "No environment variable content found for resource",
          );
        }

        const result = await this.reconcileResource(resource, serverUuid, envVars);
        results.push(result);

        if (result.action === "created") {
          totalCreated++;
        } else if (result.action === "updated") {
          totalUpdated++;
        } else if (result.action === "failed") {
          totalFailed++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          { resource: resource.name, error: errorMessage },
          "Failed to reconcile resource",
        );
        results.push({
          name: resource.name,
          action: "failed",
          error: errorMessage,
        });
        totalFailed++;
      }
    }

    const success = totalFailed === 0;
    this.logger.info(
      { success, totalCreated, totalUpdated, totalFailed },
      "Reconciliation complete",
    );

    return {
      success,
      resources: results,
      totalCreated,
      totalUpdated,
      totalFailed,
    };
  }

  /**
   * Reconciles a single resource.
   */
  private async reconcileResource(
    resource: Resource,
    serverUuid: string,
    envVars: CoolifyEnvVar[],
  ): Promise<ReconcileResourceResult> {
    const { manifest, dockerTag } = this.options;

    this.logger.info({ resource: resource.name, dockerTag }, "Reconciling resource");

    // Try to find existing application
    const existing = await this.client.findApplicationByName(resource.name);

    let uuid: string;
    let action: "created" | "updated" | "unchanged";

    if (existing) {
      // Update existing application
      uuid = existing.uuid;
      const updateOptions = CoolifyClient.buildUpdateOptions(resource, dockerTag);
      await this.client.updateApplication(uuid, updateOptions);
      action = "updated";
      this.logger.info({ resource: resource.name, uuid }, "Updated existing application");
    } else {
      // Create new application
      const createOptions = CoolifyClient.buildCreateOptions(
        resource,
        manifest.projectId,
        serverUuid,
        manifest.environmentName,
        manifest.destinationId,
        dockerTag,
      );
      const created = await this.client.createDockerImageApplication(createOptions);
      uuid = created.uuid;
      action = "created";
      this.logger.info({ resource: resource.name, uuid }, "Created new application");
    }

    // Update environment variables if provided
    if (envVars.length > 0) {
      await this.client.updateEnvironmentVariables(uuid, envVars);
      this.logger.info(
        { resource: resource.name, uuid, envVarCount: envVars.length },
        "Updated environment variables",
      );
    }

    // Trigger deployment
    await this.client.deployApplication(uuid);
    this.logger.info({ resource: resource.name, uuid }, "Triggered deployment");

    return { name: resource.name, action, uuid };
  }
}
