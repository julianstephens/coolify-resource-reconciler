import type { Logger } from "./logger.js";
import type { Resource } from "./manifest.js";

/**
 * Coolify Application response structure (subset of fields we use).
 */
export interface CoolifyApplication {
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string | null;
  docker_registry_image_name: string | null;
  docker_registry_image_tag: string | null;
  ports_exposes: string | null;
  health_check_enabled: boolean;
  health_check_path: string | null;
  health_check_port: number | null;
  repository_project_id: number | null;
  environment_id: number | null;
}

/**
 * Coolify Environment response structure.
 */
export interface CoolifyEnvironment {
  name: string;
  project_id: number;
  is_production: boolean;
}

/**
 * Coolify environment variable structure.
 */
export interface CoolifyEnvVar {
  key: string;
  value: string;
  is_preview?: boolean;
  is_literal?: boolean;
  is_multiline?: boolean;
  is_shown_once?: boolean;
}

/**
 * Coolify API error response structure.
 */
export interface CoolifyApiError {
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * Options for creating a Docker image application in Coolify.
 */
export interface CreateDockerImageAppOptions {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  docker_registry_image_name: string;
  docker_registry_image_tag?: string;
  name: string;
  description?: string;
  fqdn?: string;
  ports_exposes?: string;
  health_check_enabled?: boolean;
  health_check_path?: string;
  health_check_port?: string;
  health_check_host?: string;
  health_check_method?: string;
  health_check_return_code?: number;
  health_check_scheme?: string;
  health_check_response_text?: string;
  health_check_interval?: number;
  health_check_timeout?: number;
  health_check_retries?: number;
  health_check_start_period?: number;
  instant_deploy?: boolean;
  destination_uuid?: string;
}

/**
 * Options for updating an application in Coolify.
 */
export interface UpdateAppOptions {
  docker_registry_image_name?: string;
  docker_registry_image_tag?: string;
  name?: string;
  description?: string;
  fqdn?: string;
  ports_exposes?: string;
  health_check_enabled?: boolean;
  health_check_path?: string;
  health_check_port?: string;
  health_check_host?: string;
  health_check_method?: string;
  health_check_return_code?: number;
  health_check_scheme?: string;
  health_check_response_text?: string;
  health_check_interval?: number;
  health_check_timeout?: number;
  health_check_retries?: number;
  health_check_start_period?: number;
}

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
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    let data: unknown = null;
    if (contentType?.includes("application/json")) {
      data = await response.json();
    }

    if (!response.ok) {
      const error = data as CoolifyApiError | null;
      const errorMessage = error?.message ?? `HTTP ${response.status}: ${response.statusText}`;
      this.logger.error(
        {
          method,
          url,
          status: response.status,
          error: errorMessage,
          details: error?.errors,
        },
        "API request failed",
      );
      throw new Error(errorMessage);
    }

    return data as T;
  }

  /**
   * Lists all applications in Coolify.
   */
  async listApplications(): Promise<CoolifyApplication[]> {
    if (this.dryRun) {
      this.logger.debug("Listing applications in dry run mode");
      return [];
    }

    return this.request<CoolifyApplication[]>("GET", "/api/v1/applications");
  }

  /**
   * Lists all environments for a given project.
   */
  async listEnvironments(projectId: string): Promise<CoolifyEnvironment[]> {
    if (this.dryRun) {
      this.logger.debug({ projectId }, "[DRY RUN] Would list environments for project");
      return [];
    }
    const result = await this.request<{ data: CoolifyEnvironment[] }>(
      "GET",
      `/api/v1/projects/${projectId}/environments`,
    );
    return result.data;
  }

  /**
   * Finds an environment by name within a project.
   */
  async findEnvironmentByName(projectId: string, name: string): Promise<CoolifyEnvironment | null> {
    if (this.dryRun) {
      this.logger.debug({ name, projectId }, "[DRY RUN] Assuming environment exists for dry run");
      return { name, project_id: 0, is_production: true };
    }
    const environments = await this.listEnvironments(projectId);
    const found = environments.find((env) => env.name === name);
    if (found) {
      this.logger.debug({ name, projectId }, "Found existing environment");
    }
    return found ?? null;
  }

  /**
   * Finds an application by name.
   * Note: Searches across all applications returned by the API.
   */
  async findApplicationByName(name: string): Promise<CoolifyApplication | null> {
    const apps = await this.listApplications();
    const found = apps.find((app) => app.name === name);
    if (found) {
      this.logger.debug({ name, uuid: found.uuid }, "Found existing application");
    }
    return found ?? null;
  }

  /**
   * Creates a new Docker image-based application.
   */
  async createDockerImageApplication(options: CreateDockerImageAppOptions): Promise<CoolifyApplication> {
    if (this.dryRun) {
      this.logger.info({ options }, "[DRY RUN] Would create Docker image application");
      return {
        uuid: "dry-run-uuid",
        name: options.name,
        description: options.description ?? null,
        fqdn: options.fqdn ?? null,
        docker_registry_image_name: options.docker_registry_image_name,
        docker_registry_image_tag: options.docker_registry_image_tag ?? null,
        ports_exposes: options.ports_exposes ?? null,
        health_check_enabled: options.health_check_enabled ?? false,
        health_check_path: options.health_check_path ?? null,
        health_check_port: options.health_check_port ? Number(options.health_check_port) : null,
        repository_project_id: null,
        environment_id: null,
      };
    }

    this.logger.info({ name: options.name }, "Creating Docker image application");
    return this.request<CoolifyApplication>("POST", "/api/v1/applications/dockerimage", options);
  }

  /**
   * Updates an existing application.
   */
  async updateApplication(uuid: string, options: UpdateAppOptions): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ uuid, options }, "[DRY RUN] Would update application");
      return;
    }

    this.logger.info({ uuid, name: options.name }, "Updating application");
    await this.request<unknown>("PATCH", `/api/v1/applications/${uuid}`, options);
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
    await this.request<unknown>("PATCH", `/api/v1/applications/${uuid}/envs`, envVars);
  }

  /**
   * Triggers a deployment for an application.
   */
  async deployApplication(uuid: string): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ uuid }, "[DRY RUN] Would trigger deployment");
      return;
    }

    this.logger.info({ uuid }, "Triggering deployment");
    // Coolify uses POST for API-triggered deploys (GET is for webhook-based deploys)
    await this.request<unknown>("POST", `/api/v1/deploy`, { uuid });
  }

  /**
   * Builds CreateDockerImageAppOptions from a manifest resource.
   */
  static buildCreateOptions(
    resource: Resource,
    projectId: string,
    serverUuid: string,
    environmentName: string,
    destinationUuid: string,
    dockerTag: string,
  ): CreateDockerImageAppOptions {
    const options: CreateDockerImageAppOptions = {
      project_uuid: projectId,
      server_uuid: serverUuid,
      environment_name: environmentName,
      destination_uuid: destinationUuid,
      docker_registry_image_name: resource.dockerImageName,
      docker_registry_image_tag: dockerTag,
      name: resource.name,
      description: resource.description,
      fqdn: resource.domains || undefined,
      ports_exposes: resource.portsExposes,
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
  static buildUpdateOptions(resource: Resource, dockerTag: string): UpdateAppOptions {
    const options: UpdateAppOptions = {
      docker_registry_image_name: resource.dockerImageName,
      docker_registry_image_tag: dockerTag,
      name: resource.name,
      description: resource.description,
      fqdn: resource.domains || undefined,
      ports_exposes: resource.portsExposes,
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
