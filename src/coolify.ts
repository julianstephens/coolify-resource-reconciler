import type { Logger } from "./logger";
import type { Resource } from "./manifest";
import type {
  CoolifyApiError,
  CoolifyApplication,
  CoolifyCreateDockerImageAppOptions,
  CoolifyCreateUpdateAppResponse,
  CoolifyDeployResponse,
  CoolifyEnvironment,
  CoolifyEnvVar,
  CoolifyEnvVarResponse,
  CoolifyInitiateDeployResponse,
  CoolifyServer,
  CoolifyUpdateAppOptions,
} from "./types";

export type {
  CoolifyApiError,
  CoolifyApplication,
  CoolifyCreateDockerImageAppOptions,
  CoolifyCreateUpdateAppResponse,
  CoolifyDeployResponse,
  CoolifyEnvironment,
  CoolifyEnvVar,
  CoolifyEnvVarResponse,
  CoolifyInitiateDeployResponse,
  CoolifyServer,
  CoolifyUpdateAppOptions
} from "./types";

/**
 * Coolify API client for managing Docker image-based applications.
 */
export class CoolifyClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly logger: Logger;
  private readonly dryRun: boolean;

  constructor(baseUrl: string, token: string, logger: Logger, dryRun: boolean = false) {
    // Remove trailing slash if present
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.logger = logger;
    this.dryRun = dryRun;
  }

  /**
   * Makes an authenticated API request to Coolify.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    this.logger.debug({ method, url, hasBody: !!body }, "Making API request");

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle empty responses (like 204 No Content)
    const contentType = response.headers.get("content-type");
    if (!response.ok) {
      let error: CoolifyApiError | null = null;
      if (contentType?.includes("application/json")) {
        error = (await response.json()) as CoolifyApiError;
      }
      let errorMessage = error?.message ?? `HTTP ${response.status}: ${response.statusText}`;

      if (response.status === 401 || response.status === 403) {
        errorMessage += " - Check your API token permissions (scope).";
      }

      this.logger.error(
        {
          method,
          url,
          status: response.status,
          error: errorMessage,
        },
        "API request failed",
      );
      throw new Error(errorMessage);
    }

    if (contentType?.includes("application/json")) {
      return (await response.json()) as T;
    }

    return null;
  }

  /**
   * Makes an authenticated API request to Coolify, throwing if the result is null.
   */
  private async requestRequired<T>(method: string, path: string, body?: unknown): Promise<T> {
    const result = await this.request<T>(method, path, body);
    if (result === null) {
      throw new Error(`API request to ${path} returned an unexpected null response.`);
    }
    return result;
  }

  /**
   * Lists all applications in Coolify.
   */
  async listApplications(): Promise<CoolifyApplication[]> {
    const result = await this.request<CoolifyApplication[]>("GET", "/api/v1/applications");
    return result ?? [];
  }

  /**
   * Lists all servers.
   */
  async listServers(): Promise<CoolifyServer[]> {
    const result = await this.request<CoolifyServer[]>("GET", "/api/v1/servers");
    return result ?? [];
  }

  /**
   * Lists all environments for a given project.
   */
  async listEnvironments(projectId: string): Promise<CoolifyEnvironment[]> {
    const result = await this.request<CoolifyEnvironment[]>("GET", `/api/v1/projects/${projectId}/environments`);
    return result ?? [];
  }

  /**
   * Finds an environment by name within a project.
   */
  async findEnvironmentByName(projectId: string, name: string): Promise<CoolifyEnvironment | null> {
    const environments = await this.listEnvironments(projectId);
    const found = environments.find((env) => env.name === name);
    if (found) {
      this.logger.debug({ name, projectId }, "Found existing environment");
    }
    return found ?? null;
  }

  /**
   * Finds an application by name within a specific environment.
   * Note: Searches across all applications returned by the API.
   */
  async findApplicationByName(name: string, environmentId: number): Promise<CoolifyApplication | null> {
    const applications = await this.listApplications();
    return applications.find((app) => app.name === name && app.environment_id === environmentId) ?? null;
  }

  /**
   * Creates a new Docker image-based application.
   */
  async createDockerImageApplication(
    options: CoolifyCreateDockerImageAppOptions,
  ): Promise<CoolifyCreateUpdateAppResponse> {
    if (this.dryRun) {
      this.logger.info({ options }, "[DRY RUN] Would create Docker image application");
      return {
        uuid: "dry-run-uuid",
      };
    }

    this.logger.info({ name: options.name }, "Creating Docker image application");
    return this.requestRequired<CoolifyCreateUpdateAppResponse>("POST", "/api/v1/applications/dockerimage", options);
  }

  /**
   * Updates an existing application.
   */
  async updateApplication(uuid: string, options: CoolifyUpdateAppOptions): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ uuid, options }, "[DRY RUN] Would update application");
      return;
    }

    this.logger.info({ uuid, name: options.name }, "Updating application");
    this.logger.debug({ uuid, options }, "Update application payload");
    await this.request("PATCH", `/api/v1/applications/${uuid}`, options);
  }

  /**
   * Updates environment variables for an application.
   */
  async updateEnvironmentVariables(uuid: string, envVars: CoolifyEnvVar[]): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ uuid, envVarCount: envVars.length }, "[DRY RUN] Would update environment variables");
      return;
    }

    this.logger.info({ uuid, envVarCount: envVars.length }, "Updating environment variables");
    await this.request("PATCH", `/api/v1/applications/${uuid}/envs/bulk`, { data: envVars });
  }

  /**
   * Lists environment variables for an application.
   */
  async listEnvironmentVariables(uuid: string): Promise<CoolifyEnvVarResponse[]> {
    const result = await this.request<CoolifyEnvVarResponse[]>("GET", `/api/v1/applications/${uuid}/envs`);
    return result ?? [];
  }

  /**
   * Deletes an environment variable from an application.
   */
  async deleteEnvironmentVariable(appUuid: string, envUuid: string): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ appUuid, envUuid }, "[DRY RUN] Would delete environment variable");
      return;
    }

    this.logger.info({ appUuid, envUuid }, "Deleting environment variable");
    await this.request("DELETE", `/api/v1/applications/${appUuid}/envs/${envUuid}`);
  }

  /**
   * Deletes an application.
   */
  async deleteApplication(uuid: string): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ uuid }, "[DRY RUN] Would delete application");
      return;
    }

    this.logger.info({ uuid }, "Deleting application");
    await this.request("DELETE", `/api/v1/applications/${uuid}`);
  }

  /**
   * Triggers a deployment for an application.
   * Returns the deployment UUID.
   */
  async deployApplication(uuid: string): Promise<string | null> {
    if (this.dryRun) {
      this.logger.info({ uuid }, "[DRY RUN] Would trigger deployment");
      return "dry-run-deployment-uuid";
    }

    this.logger.info({ uuid }, "Triggering deployment");
    // Coolify uses POST for API-triggered deploys (GET is for webhook-based deploys)
    // Note: The API documentation says "You can only use uuid or tag, not both."
    // We are deploying a specific application by UUID, so we should not send a tag.
    const response = await this.request<CoolifyInitiateDeployResponse>("POST", `/api/v1/deploy`, {
      uuid,
    });
    return response?.deployments?.[0]?.deployment_uuid ?? null;
  }

  /**
   * Gets the status of a deployment.
   */
  async getDeployment(uuid: string): Promise<CoolifyDeployResponse | null> {
    if (this.dryRun) {
      this.logger.debug({ uuid }, "[DRY RUN] Would get deployment status");
      return { status: "finished", deployment_uuid: uuid } as CoolifyDeployResponse;
    }
    return this.request<CoolifyDeployResponse>("GET", `/api/v1/deployments/${uuid}`);
  }

  /**
   * Waits for a deployment to finish.
   * Polls every 2 seconds. Times out after 5 minutes (default).
   */
  async waitForDeployment(uuid: string, timeoutMs = 300000, intervalMs = 2000): Promise<CoolifyDeployResponse> {
    if (this.dryRun) {
      this.logger.info({ uuid }, "[DRY RUN] Would wait for deployment to finish");
      return { status: "finished", deployment_uuid: uuid } as CoolifyDeployResponse;
    }

    this.logger.info({ uuid }, "Waiting for deployment to finish...");
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const deployment = await this.getDeployment(uuid);
      if (!deployment) {
        this.logger.warn({ uuid }, "Deployment not found, retrying...");
      } else {
        const status = deployment.status;
        this.logger.debug({ uuid, status }, "Polling deployment status");

        if (status === "finished") {
          this.logger.info({ uuid }, "Deployment finished successfully");
          return deployment;
        }
        if (status === "failed") {
          this.logger.error({ uuid }, "Deployment failed");
          throw new Error(`Deployment ${uuid} failed.`);
        }
        // other statuses: queued, in_progress, etc.
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Deployment ${uuid} timed out after ${timeoutMs}ms`);
  }

  /**
   * Builds CreateDockerImageAppOptions from a manifest resource.
   */
  static buildCreateOptions(
    resource: Resource,
    projectId: string,
    serverId: string,
    environmentName: string,
    environmentUuid: string,
    destinationUuid: string,
    dockerTag: string,
  ): CoolifyCreateDockerImageAppOptions {
    const options: CoolifyCreateDockerImageAppOptions = {
      project_uuid: projectId,
      server_uuid: serverId,
      environment_name: environmentName,
      environment_uuid: environmentUuid,
      destination_uuid: destinationUuid,
      docker_registry_image_name: resource.dockerImageName,
      docker_registry_image_tag: dockerTag,
      name: resource.name,
      description: resource.description,
      domains: resource.domains || undefined,
      ports_exposes: resource.portsExposes || undefined,
      instant_deploy: false, // We'll deploy after setting env vars
    };

    if (resource.healthCheck) {
      options.health_check_enabled = true;
      options.health_check_path = resource.healthCheck.path;
      options.health_check_port = resource.healthCheck.port;
      options.health_check_host = resource.healthCheck.host;
      options.health_check_method = resource.healthCheck.method;
      options.health_check_return_code = resource.healthCheck.returnCode;
      options.health_check_scheme = resource.healthCheck.scheme;
      options.health_check_response_text = resource.healthCheck.responseText;
      options.health_check_interval = resource.healthCheck.interval;
      options.health_check_timeout = resource.healthCheck.timeout;
      options.health_check_retries = resource.healthCheck.retries;
      options.health_check_start_period = resource.healthCheck.startPeriod;
    }

    return options;
  }

  /**
   * Builds UpdateAppOptions from a manifest resource.
   */
  static buildUpdateOptions(resource: Resource, dockerTag: string): CoolifyUpdateAppOptions {
    const options: CoolifyUpdateAppOptions = {
      docker_registry_image_name: resource.dockerImageName,
      docker_registry_image_tag: dockerTag,
      name: resource.name,
      description: resource.description,
      domains: resource.domains || undefined,
      ports_exposes: resource.portsExposes || undefined,
    };

    if (resource.healthCheck) {
      options.health_check_enabled = true;
      options.health_check_path = resource.healthCheck.path;
      options.health_check_port = resource.healthCheck.port;
      options.health_check_host = resource.healthCheck.host;
      options.health_check_method = resource.healthCheck.method;
      options.health_check_return_code = resource.healthCheck.returnCode;
      options.health_check_scheme = resource.healthCheck.scheme;
      options.health_check_response_text = resource.healthCheck.responseText;
      options.health_check_interval = resource.healthCheck.interval;
      options.health_check_timeout = resource.healthCheck.timeout;
      options.health_check_retries = resource.healthCheck.retries;
      options.health_check_start_period = resource.healthCheck.startPeriod;
    }

    return options;
  }
}
