import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoolifyClient } from "./coolify.js";

describe("Coolify Client - Introspection for Init Command", () => {
  const baseUrl = "https://coolify.example.com";
  const token = "test-token";
  let client: CoolifyClient;

  beforeEach(() => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      silent: vi.fn(),
      level: "info",
    };
    client = new CoolifyClient(baseUrl, token, logger as never);
  });

  describe("findApplicationByName", () => {
    it("should return application when found", async () => {
      const mockApps = [
        {
          id: "app1",
          name: "my-app",
          docker_registry_image_name: "ghcr.io/user/my-app",
          fqdn: "app.example.com",
          ports_exposes: "3000",
          description: "Test application",
          health_check_path: "/api/health",
          health_check_port: "3000",
        },
      ];

      vi.spyOn(client, "listApplications").mockResolvedValueOnce(mockApps as unknown as never);

      const result = await client.findApplicationByName("my-app");

      expect(result).toEqual(mockApps[0]);
    });

    it("should return null when application not found", async () => {
      const mockApps = [
        {
          id: "app1",
          name: "other-app",
        },
      ];

      vi.spyOn(client, "listApplications").mockResolvedValueOnce(mockApps as unknown as never);

      const result = await client.findApplicationByName("my-app");

      expect(result).toBeNull();
    });

    it("should handle empty application list", async () => {
      vi.spyOn(client, "listApplications").mockResolvedValueOnce([] as never);

      const result = await client.findApplicationByName("my-app");

      expect(result).toBeNull();
    });
  });

  describe("Introspection Integration Scenario", () => {
    it("should support resource enrichment from existing Coolify apps", async () => {
      const existingApps = [
        {
          id: "app1",
          name: "my-service",
          docker_registry_image_name: "ghcr.io/org/my-service:latest",
          fqdn: "my-service.prod.example.com",
          ports_exposes: "8080",
          description: "Production API service",
          health_check_path: "/api/health",
          health_check_port: "8080",
        },
      ];

      vi.spyOn(client, "listApplications").mockResolvedValueOnce(
        existingApps as unknown as never,
      );

      // Simulate finding an app for enrichment
      const appName = "my-service";
      const foundApp = await client.findApplicationByName(appName);

      if (foundApp) {
        // Verify introspected values would be used
        expect(foundApp.fqdn).toBe("my-service.prod.example.com");
        expect(foundApp.ports_exposes).toBe("8080");
        expect(foundApp.health_check_path).toBe("/api/health");
        expect(foundApp.docker_registry_image_name).toContain("ghcr.io");
      } else {
        throw new Error("Expected to find app");
      }
    });

    it("should fallback to defaults when app not found", async () => {
      const existingApps = [
        {
          id: "app1",
          name: "other-service",
        },
      ];

      vi.spyOn(client, "listApplications").mockResolvedValueOnce(
        existingApps as unknown as never,
      );

      const foundApp = await client.findApplicationByName("my-service");

      expect(foundApp).toBeNull();

      // In init command, defaults would be used:
      // domains: "app.example.com"
      // portsExposes: "8080"
      // healthCheck.path: "/health"
    });
  });
});
