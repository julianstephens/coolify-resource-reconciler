import type pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoolifyClient } from "./coolify";
import type { Resource } from "./manifest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Creates a mock headers object that implements the Headers.get method
 */
function createMockHeaders(headers: Record<string, string>) {
  return {
    get: (name: string) => headers[name.toLowerCase()] ?? null,
  };
}

describe("CoolifyClient", () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  } as unknown as pino.Logger;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listApplications", () => {
    it("should list applications", async () => {
      const mockApps = [
        { uuid: "app-1", name: "App 1" },
        { uuid: "app-2", name: "App 2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockApps),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);

      const apps = await client.listApplications();
      expect(apps).toEqual(mockApps);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve({ message: "Invalid token" }),
      });

      const client = new CoolifyClient("https://coolify.example.com", "bad-token", mockLogger);

      await expect(client.listApplications()).rejects.toThrow("Invalid token");
    });
  });

  describe("findApplicationByName", () => {
    it("should find an application by name and environment ID", async () => {
      const mockApps = [
        { uuid: "app-1", name: "App 1", environment_id: 123 },
        { uuid: "app-2", name: "App 2", environment_id: 456 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockApps),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);

      const app = await client.findApplicationByName("App 1", 123);
      expect(app).toEqual({ uuid: "app-1", name: "App 1", environment_id: 123 });
    });

    it("should return null if app name matches but environment ID does not", async () => {
      const mockApps = [{ uuid: "app-1", name: "App 1", environment_id: 456 }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockApps),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);

      const app = await client.findApplicationByName("App 1", 123);
      expect(app).toBeNull();
    });

    it("should return null if app not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve([]),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);

      const app = await client.findApplicationByName("Non-existent", 123);
      expect(app).toBeNull();
    });
  });

  describe("listEnvironments", () => {
    it("should list environments for a project", async () => {
      const mockEnvs = [
        { name: "production", project_uuid: "project-1" },
        { name: "staging", project_uuid: "project-1" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockEnvs),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      const envs = await client.listEnvironments("project-1");

      expect(envs).toEqual(mockEnvs);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/projects/project-1/environments",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });

    it("should handle API errors when listing environments", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve({ message: "Internal Server Error" }),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);

      await expect(client.listEnvironments("project-1")).rejects.toThrow("Internal Server Error");
    });
  });

  describe("findEnvironmentByName", () => {
    it("should find an environment by name", async () => {
      const mockEnvs = [
        { name: "production", project_uuid: "project-1" },
        { name: "staging", project_uuid: "project-1" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockEnvs),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      const env = await client.findEnvironmentByName("project-1", "staging");

      expect(env).toEqual({ name: "staging", project_uuid: "project-1" });
    });

    it("should return null if environment is not found", async () => {
      const mockEnvs = [{ name: "production", project_uuid: "project-1" }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockEnvs),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      const env = await client.findEnvironmentByName("project-1", "non-existent");

      expect(env).toBeNull();
    });

    it("should throw if the API call fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve({ message: "Internal Server Error" }),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      await expect(client.findEnvironmentByName("project-1", "any-env")).rejects.toThrow("Internal Server Error");
    });
  });

  describe("dry run mode", () => {
    it("should not make API calls in dry run mode for create", async () => {
      const client = new CoolifyClient(
        "https://coolify.example.com",
        "test-token",
        mockLogger,
        true, // dryRun
      );

      const result = await client.createDockerImageApplication({
        project_uuid: "project-uuid",
        server_uuid: "server-uuid",
        environment_name: "production",
        environment_uuid: "env-uuid",
        docker_registry_image_name: "ghcr.io/test/app",
        name: "Test App",
      });

      expect(result.uuid).toBe("dry-run-uuid");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.anything(),
        "[DRY RUN] Would create Docker image application",
      );
    });

    it("should not make API calls in dry run mode for update", async () => {
      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger, true);

      await client.updateApplication("app-uuid", { name: "Updated App" });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.anything(), "[DRY RUN] Would update application");
    });

    it("should not make API calls in dry run mode for deploy", async () => {
      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger, true);

      const uuid = await client.deployApplication("app-uuid");

      expect(uuid).toBe("dry-run-deployment-uuid");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: "app-uuid" }),
        "[DRY RUN] Would trigger deployment",
      );
    });
  });

  describe("deployApplication", () => {
    it("should trigger deployment and return uuid", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve({ deployments: [{ deployment_uuid: "deploy-123" }] }),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      const uuid = await client.deployApplication("app-uuid");

      expect(uuid).toBe("deploy-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deploy",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ uuid: "app-uuid" }),
        }),
      );
    });
  });

  describe("getDeployment", () => {
    it("should get deployment status", async () => {
      const mockDeployment = { status: "finished", deployment_uuid: "deploy-123" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockDeployment),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      const deployment = await client.getDeployment("deploy-123");

      expect(deployment).toEqual(mockDeployment);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deployments/deploy-123",
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  describe("waitForDeployment", () => {
    it("should wait for deployment to finish", async () => {
      const mockDeploymentFinished = { status: "finished", deployment_uuid: "deploy-123" };
      const mockDeploymentInProgress = { status: "in_progress", deployment_uuid: "deploy-123" };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: createMockHeaders({ "content-type": "application/json" }),
          json: () => Promise.resolve(mockDeploymentInProgress),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: createMockHeaders({ "content-type": "application/json" }),
          json: () => Promise.resolve(mockDeploymentFinished),
        });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      // Short interval for test
      const deployment = await client.waitForDeployment("deploy-123", 1000, 10);

      expect(deployment).toEqual(mockDeploymentFinished);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should throw on failure", async () => {
      const mockDeploymentFailed = { status: "failed", deployment_uuid: "deploy-123" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockDeploymentFailed),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      await expect(client.waitForDeployment("deploy-123", 1000, 10)).rejects.toThrow("Deployment deploy-123 failed.");
    });

    it("should throw on timeout", async () => {
      const mockDeploymentInProgress = { status: "in_progress", deployment_uuid: "deploy-123" };

      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders({ "content-type": "application/json" }),
        json: () => Promise.resolve(mockDeploymentInProgress),
      });

      const client = new CoolifyClient("https://coolify.example.com", "test-token", mockLogger);
      await expect(client.waitForDeployment("deploy-123", 50, 10)).rejects.toThrow("timed out");
    });
  });

  describe("buildCreateOptions", () => {
    it("should build create options from resource", () => {
      const resource: Resource = {
        name: "my-app",
        description: "A sample app",
        dockerImageName: "image-name",
        envSecretName: "env-secret",
        domains: "test.com",
        portsExposes: "3000",
        healthCheck: {
          path: "/health",
          port: "3000",
        },
      };

      const options = CoolifyClient.buildCreateOptions(
        resource,
        "project-uuid",
        "server-uuid",
        "production",
        "env-uuid",
        "dest-uuid",
        "v1.0.0",
      );

      expect(options).toEqual({
        project_uuid: "project-uuid",
        server_uuid: "server-uuid",
        environment_name: "production",
        environment_uuid: "env-uuid",
        destination_uuid: "dest-uuid",
        docker_registry_image_name: "image-name",
        docker_registry_image_tag: "v1.0.0",
        name: "my-app",
        description: "A sample app",
        domains: "test.com",
        ports_exposes: "3000",
        instant_deploy: false,
        health_check_enabled: true,
        health_check_path: "/health",
        health_check_port: "3000",
        health_check_host: undefined,
        health_check_interval: undefined,
        health_check_method: undefined,
        health_check_response_text: undefined,
        health_check_retries: undefined,
        health_check_return_code: undefined,
        health_check_scheme: undefined,
        health_check_start_period: undefined,
        health_check_timeout: undefined,
      });
    });

    it("should handle resource without health check", () => {
      const resource: Resource = {
        name: "my-app",
        description: "",
        dockerImageName: "ghcr.io/owner/repo/app",
        domains: "",
        portsExposes: "3000",
      } as Resource;

      const options = CoolifyClient.buildCreateOptions(
        resource,
        "project-uuid",
        "server-uuid",
        "production",
        "prod-uuid",
        "destination-uuid",
        "latest",
      );

      expect(options.health_check_enabled).toBeUndefined();
      expect(options.health_check_path).toBeUndefined();
      expect(options.health_check_port).toBeUndefined();
    });
  });

  describe("buildUpdateOptions", () => {
    it("should build update options from resource", () => {
      const resource: Resource = {
        name: "my-app",
        description: "Updated Description",
        dockerImageName: "ghcr.io/owner/repo/app",
        domains: "new.example.com",
        portsExposes: "4000",
        healthCheck: {
          path: "/healthz",
          port: "4000",
        },
      } as Resource;

      const options = CoolifyClient.buildUpdateOptions(resource, "v2.0.0");

      expect(options).toEqual({
        docker_registry_image_name: "ghcr.io/owner/repo/app",
        docker_registry_image_tag: "v2.0.0",
        name: "my-app",
        description: "Updated Description",
        domains: "new.example.com",
        ports_exposes: "4000",
        health_check_enabled: true,
        health_check_path: "/healthz",
        health_check_port: "4000",
        health_check_host: undefined,
        health_check_interval: undefined,
        health_check_method: undefined,
        health_check_response_text: undefined,
        health_check_retries: undefined,
        health_check_return_code: undefined,
        health_check_scheme: undefined,
        health_check_start_period: undefined,
        health_check_timeout: undefined,
      });
    });
  });
});
