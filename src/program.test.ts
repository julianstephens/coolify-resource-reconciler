import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitCommand } from "./program.js";

vi.mock("node:fs/promises");
vi.mock("node:child_process");

describe("Program - Init Command", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should parse options for project ID and environment", async () => {
        const command = createInitCommand();

        // Verify options are properly defined
        const options = command.opts();
        expect(options).toBeDefined();

        // The command should have output option defined
        const outputOption = command.options.find((opt) => opt.long === "--output");
        expect(outputOption).toBeDefined();

        // The command should have project-id option defined
        const projectIdOption = command.options.find((opt) => opt.long === "--project-id");
        expect(projectIdOption).toBeDefined();

        // The command should have environment option defined
        const envOption = command.options.find((opt) => opt.long === "--environment");
        expect(envOption).toBeDefined();
    });

    it("should have description for init command", () => {
        const command = createInitCommand();
        expect(command.description()).toBe(
            "Initialize a new coolify.manifest.json by scanning the monorepo",
        );
    });

    it("should handle default option values", () => {
        const command = createInitCommand();
        const options = command.opts();

        // Check that output defaults to ./coolify.manifest.json
        const outputOption = command.options.find((opt) => opt.long === "--output");
        expect(outputOption?.defaultValue).toBe("./coolify.manifest.json");

        // Check that environment defaults to production
        const envOption = command.options.find((opt) => opt.long === "--environment");
        expect(envOption?.defaultValue).toBe("production");
    });
});
