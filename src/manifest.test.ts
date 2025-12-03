import { describe, expect, it } from "vitest";
import {
  manifestSchema,
  parseManifest,
  resourceSchema,
  safeParseManifest,
  type Manifest,
  type Resource,
} from "./manifest.js";

describe("Manifest Schema", () => {
  describe("resourceSchema", () => {
    it("should validate a valid resource", () => {
      const resource: Resource = {
        name: "my-app",
        description: "My Application",
        dockerImageName: "ghcr.io/owner/repo/app",
        envSecretName: "MY_APP_ENV",
        domains: "app.example.com",
        portsExposes: "3000",
        healthCheck: {
          path: "/health",
          port: "3000",
        },
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });

    it("should validate resource without optional fields", () => {
      const resource: Partial<Resource> = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        envSecretName: "MY_APP_ENV",
        portsExposes: "3000",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });

    it("should reject resource with empty name", () => {
      const resource: Partial<Resource> = {
        name: "",
        dockerImageName: "ghcr.io/owner/repo/app",
        envSecretName: "MY_APP_ENV",
        portsExposes: "3000",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(false);
    });

    it("should reject resource with invalid ports", () => {
      const resource: Partial<Resource> = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        envSecretName: "MY_APP_ENV",
        portsExposes: "invalid-port",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(false);
    });

    it("should accept multiple ports", () => {
      const resource: Resource = {
        name: "my-app",
        dockerImageName: "ghcr.io/owner/repo/app",
        envSecretName: "MY_APP_ENV",
        portsExposes: "3000, 8080,443",
        description: "",
        domains: "",
      };

      const result = resourceSchema.safeParse(resource);
      expect(result.success).toBe(true);
    });
  });

  describe("manifestSchema", () => {
    it("should validate a complete manifest", () => {
      const manifest: Manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        serverUuid: "server-uuid",
        environmentName: "production",
        envFileSecretName: "GLOBAL_ENV",
        resources: [
          {
            name: "my-app",
            description: "My Application",
            dockerImageName: "ghcr.io/owner/repo/app",
            envSecretName: "MY_APP_ENV",
            domains: "app.example.com",
            portsExposes: "3000",
            healthCheck: {
              path: "/health",
              port: "3000",
            },
          },
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it("should use defaults for optional fields", () => {
      const manifest: Partial<Manifest> = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            envSecretName: "MY_APP_ENV",
            portsExposes: "3000",
          } as Resource,
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.environmentName).toBe("production");
        expect(result.data.envFileSecretName).toBe("PRODUCTION_ENV_FILE");
      }
    });

    it("should reject manifest without resources", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });

    it("should reject manifest without projectId", () => {
      const manifest = {
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            envSecretName: "MY_APP_ENV",
            portsExposes: "3000",
          },
        ],
      };

      const result = manifestSchema.safeParse(manifest);
      expect(result.success).toBe(false);
    });
  });

  describe("parseManifest", () => {
    it("should parse a valid manifest", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            envSecretName: "MY_APP_ENV",
            portsExposes: "3000",
          },
        ],
      };

      const parsed = parseManifest(manifest);
      expect(parsed.projectId).toBe("project-uuid");
      expect(parsed.resources[0].name).toBe("my-app");
    });

    it("should throw for invalid manifest", () => {
      const manifest = {
        projectId: "",
        destinationId: "destination-uuid",
        resources: [],
      };

      expect(() => parseManifest(manifest)).toThrow();
    });
  });

  describe("safeParseManifest", () => {
    it("should return success for valid manifest", () => {
      const manifest = {
        projectId: "project-uuid",
        destinationId: "destination-uuid",
        resources: [
          {
            name: "my-app",
            dockerImageName: "ghcr.io/owner/repo/app",
            envSecretName: "MY_APP_ENV",
            portsExposes: "3000",
          },
        ],
      };

      const result = safeParseManifest(manifest);
      expect(result.success).toBe(true);
    });

    it("should return error for invalid manifest", () => {
      const manifest = {
        projectId: "",
        resources: [],
      };

      const result = safeParseManifest(manifest);
      expect(result.success).toBe(false);
    });
  });
});
