import type pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoolifyClient } from "./coolify.js";
import type { Manifest } from "./manifest.js";
import { envVarsToCoolifyFormat, parseEnvFile, Reconciler } from "./reconciler.js";

describe("parseEnvFile", () => {
  it("should parse simple key=value pairs", () => {
    const content = `
KEY1=value1
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle double-quoted values", () => {
    const content = `KEY="quoted value"`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY: "quoted value",
    });
  });

  it("should handle single-quoted values", () => {
    const content = `KEY='single quoted'`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY: "single quoted",
    });
  });

  it("should skip empty lines", () => {
    const content = `
KEY1=value1

KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should skip comment lines", () => {
    const content = `
# This is a comment
KEY1=value1
# Another comment
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle values with equals signs", () => {
    const content = `DATABASE_URL=postgres://user:pass@host:5432/db?query=value`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      DATABASE_URL: "postgres://user:pass@host:5432/db?query=value",
    });
  });

  it("should handle empty values", () => {
    const content = `EMPTY_KEY=`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      EMPTY_KEY: "",
    });
  });

  it("should handle keys with underscores and numbers", () => {
    const content = `
MY_KEY_123=value1
_PRIVATE=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      MY_KEY_123: "value1",
      _PRIVATE: "value2",
    });
  });

  it("should handle Windows line endings", () => {
    const content = "KEY1=value1\r\nKEY2=value2\r\n";
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should handle empty content", () => {
    const result = parseEnvFile("");
    expect(result).toEqual({});
  });

  it("should skip lines with invalid format", () => {
    const content = `
KEY1=value1
invalid line without equals
KEY2=value2
`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });
});

describe("envVarsToCoolifyFormat", () => {
  it("should convert env vars to Coolify format", () => {
    const envVars = {
      KEY1: "value1",
      KEY2: "value2",
    };

    const result = envVarsToCoolifyFormat(envVars);

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      key: "KEY1",
      value: "value1",
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
    });
    expect(result).toContainEqual({
      key: "KEY2",
      value: "value2",
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
    });
  });

  it("should mark multiline values", () => {
    const envVars = {
      MULTILINE: "line1\nline2\nline3",
    };

    const result = envVarsToCoolifyFormat(envVars);

    expect(result[0].is_multiline).toBe(true);
  });

  it("should handle empty env vars", () => {
    const result = envVarsToCoolifyFormat({});
    expect(result).toEqual([]);
  });
});

describe("Reconciler", () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  } as unknown as pino.Logger;

  const createMockClient = () => ({
    findApplicationByName: vi.fn(),
    createDockerImageApplication: vi.fn(),
    updateApplication: vi.fn(),
    updateEnvironmentVariables: vi.fn(),
    deployApplication: vi.fn(),
    findEnvironmentByName: vi.fn(),
  });

  const createTestManifest = (): Manifest => ({
    projectId: "test-project-uuid",
    destinationId: "test-destination-uuid",
    serverUuid: "test-server-uuid",
    environmentName: "production",
    envFileSecretName: "PRODUCTION_ENV_FILE",
    resources: [
      {
        name: "test-app",
        description: "Test application",
        dockerImageName: "ghcr.io/owner/repo-app",
        envSecretName: "TEST_APP_ENV",
        domains: "app.example.com",
        portsExposes: "3000",
        healthCheck: {
          path: "/health",
          port: "3000",
        },
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reconcile()", () => {
    it("should create a new application when it does not exist", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue(null);
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.totalCreated).toBe(1);
      expect(result.totalUpdated).toBe(0);
      expect(result.totalFailed).toBe(0);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]).toEqual({
        name: "test-app",
        action: "created",
        uuid: "new-app-uuid",
      });
      expect(mockClient.createDockerImageApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-app",
          docker_registry_image_tag: "v1.0.0",
        }),
      );
      expect(mockClient.deployApplication).toHaveBeenCalledWith("new-app-uuid");
    });

    it("should update an existing application", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue({
        uuid: "existing-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v2.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.totalCreated).toBe(0);
      expect(result.totalUpdated).toBe(1);
      expect(result.totalFailed).toBe(0);
      expect(result.resources[0]).toEqual({
        name: "test-app",
        action: "updated",
        uuid: "existing-app-uuid",
      });
      expect(mockClient.updateApplication).toHaveBeenCalledWith(
        "existing-app-uuid",
        expect.objectContaining({
          docker_registry_image_tag: "v2.0.0",
        }),
      );
      expect(mockClient.deployApplication).toHaveBeenCalledWith("existing-app-uuid");
    });

    it("should fail if the target environment does not exist", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue(null);

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(false);
      expect(result.totalFailed).toBe(manifest.resources.length);
      expect(mockClient.findEnvironmentByName).toHaveBeenCalledWith(
        "test-project-uuid",
        "production",
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          projectId: "test-project-uuid",
          environmentName: "production",
        },
        "Target environment does not exist in Coolify project",
      );
      expect(mockClient.findApplicationByName).not.toHaveBeenCalled();
    });

    it("should proceed if the target environment exists", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue(null);
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.totalCreated).toBe(1);
      expect(mockClient.findEnvironmentByName).toHaveBeenCalledWith(
        "test-project-uuid",
        "production",
      );
      expect(mockLogger.error).not.toHaveBeenCalledWith(
        expect.any(Object), // The first argument is an object with metadata
        "Target environment does not exist in Coolify project",
      );
      expect(mockClient.createDockerImageApplication).toHaveBeenCalled();
    });

    it("should handle multiple resources", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ uuid: "existing-uuid", name: "app-2" });
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-uuid",
        name: "app-1",
      });

      const manifest: Manifest = {
        ...createTestManifest(),
        resources: [
          {
            name: "app-1",
            description: "First app",
            dockerImageName: "ghcr.io/owner/repo-app1",
            envSecretName: "APP1_ENV",
            domains: "app1.example.com",
            portsExposes: "3000",
          },
          {
            name: "app-2",
            description: "Second app",
            dockerImageName: "ghcr.io/owner/repo-app2",
            envSecretName: "APP2_ENV",
            domains: "app2.example.com",
            portsExposes: "4000",
          },
        ],
      };

      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "latest",
        envSecrets: {
          APP1_ENV: "",
          APP2_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(result.totalCreated).toBe(1);
      expect(result.totalUpdated).toBe(1);
      expect(result.resources).toHaveLength(2);
    });

    it("should fail when server UUID is not provided", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      const manifest: Manifest = {
        projectId: "test-project-uuid",
        destinationId: "test-destination-uuid",
        environmentName: "production",
        envFileSecretName: "PRODUCTION_ENV_FILE",
        resources: [
          {
            name: "test-app",
            description: "",
            dockerImageName: "ghcr.io/owner/repo-app",
            envSecretName: "TEST_APP_ENV",
            domains: "",
            portsExposes: "3000",
          },
        ],
      };

      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(false);
      expect(result.totalFailed).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        {},
        "Server UUID is required but not provided in manifest or options",
      );
    });

    it("should handle resource reconciliation errors gracefully", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockRejectedValue(new Error("API Error"));

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(false);
      expect(result.totalFailed).toBe(1);
      expect(result.resources[0]).toEqual({
        name: "test-app",
        action: "failed",
        error: "API Error",
      });
    });

    it("should parse and apply environment variables", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue(null);
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "DATABASE_URL=postgres://localhost\nAPI_KEY=secret123",
        },
      });

      const result = await reconciler.reconcile();

      expect(result.success).toBe(true);
      expect(mockClient.updateEnvironmentVariables).toHaveBeenCalledWith(
        "new-app-uuid",
        expect.arrayContaining([
          expect.objectContaining({ key: "DATABASE_URL", value: "postgres://localhost" }),
          expect.objectContaining({ key: "API_KEY", value: "secret123" }),
        ]),
      );
    });

    it("should skip environment variable update when no env content provided", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue(null);
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      await reconciler.reconcile();

      expect(mockClient.updateEnvironmentVariables).not.toHaveBeenCalled();
    });

    it("should use serverUuid from options over manifest", async () => {
      const mockClient = createMockClient();
      mockClient.findEnvironmentByName.mockResolvedValue({
        name: "production",
        project_uuid: "test-project-uuid",
      });
      mockClient.findApplicationByName.mockResolvedValue(null);
      mockClient.createDockerImageApplication.mockResolvedValue({
        uuid: "new-app-uuid",
        name: "test-app",
      });

      const manifest = createTestManifest();
      const reconciler = new Reconciler(mockClient as unknown as CoolifyClient, mockLogger, {
        manifest,
        dockerTag: "v1.0.0",
        serverUuid: "override-server-uuid",
        envSecrets: {
          TEST_APP_ENV: "",
        },
      });

      await reconciler.reconcile();

      expect(mockClient.createDockerImageApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          server_uuid: "override-server-uuid",
        }),
      );
    });
  });
});
