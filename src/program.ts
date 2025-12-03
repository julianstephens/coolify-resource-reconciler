import { Command } from "@commander-js/extra-typings";
import { execSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CoolifyClient } from "./coolify.js";
import { parseEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { parseManifest } from "./manifest.js";
import { Reconciler } from "./reconciler.js";

/**
 * Creates the root program with global options.
 */
export async function createProgram() {
  const pkg = await readFile(new URL("../package.json", import.meta.url), "utf-8").then(JSON.parse);

  const program = new Command()
    .name("cdeploy")
    .description("A tool to deploy and manage resources in Coolify using a manifest file.")
    .version(pkg.version)
    .option("-m, --manifest <path>", "Path to coolify.manifest.json file", process.env.MANIFEST_PATH)
    .option("-s, --server-uuid <uuid>", "Coolify server UUID (overrides manifest)")
    .option("-d, --dry-run", "Run without making changes", process.env.DRY_RUN === "true");

  return program;
}

export type ProgramOptions = ReturnType<Awaited<ReturnType<typeof createProgram>>["opts"]>;

/**
 * Creates the 'apply' subcommand.
 */
export function createApplyCommand() {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const command = new Command<[], {}, ProgramOptions>("apply")
    .description("Apply the configuration from the manifest to Coolify")
    .option(
      "-t, --tag <tag>",
      'Docker image tag to deploy (e.g., "latest" or "v1.0.0")',
      process.env.DOCKER_IMAGE_TAG || "latest",
    )
    .action(async (options, command) => {
      const globalOptions = command.optsWithGlobals();

      const env = parseEnv();
      const logger = createLogger(env);

      const manifestPath = globalOptions.manifest;
      if (!manifestPath) {
        logger.fatal({}, "Manifest path is required. Use --manifest or MANIFEST_PATH env var.");
        process.exit(1);
      }

      const dockerTag = options.tag;
      if (!dockerTag) {
        logger.fatal({}, "Docker image tag is required. Use --tag or DOCKER_IMAGE_TAG env var.");
        process.exit(1);
      }

      const dryRun = globalOptions.dryRun;

      logger.info({ manifestPath, dockerTag, dryRun }, "Starting Coolify deploy tool");

      try {
        const absolutePath = resolve(process.cwd(), manifestPath);
        logger.debug({ path: absolutePath }, "Reading manifest file");

        const manifestContent = await readFile(absolutePath, "utf-8");
        const manifestData = JSON.parse(manifestContent);
        const manifest = parseManifest(manifestData);

        logger.info(
          {
            projectId: manifest.projectId,
            environmentName: manifest.environmentName,
            resourceCount: manifest.resources.length,
          },
          "Manifest loaded successfully",
        );

        const client = new CoolifyClient(env.COOLIFY_ENDPOINT_URL, env.COOLIFY_TOKEN, logger, dryRun);

        const envSecrets: Record<string, string> = {};
        for (const key in process.env) {
          if (key.startsWith("COOLIFY_ENV_")) {
            const value = process.env[key];
            if (value) {
              envSecrets[key] = value;
            }
          }
        }

        const reconciler = new Reconciler(client, logger, {
          manifest,
          dockerTag,
          envSecrets,
          serverUuid: globalOptions.serverUuid,
        });

        const result = await reconciler.reconcile();

        logger.info(
          {
            success: result.success,
            totalCreated: result.totalCreated,
            totalUpdated: result.totalUpdated,
            totalFailed: result.totalFailed,
            resources: result.resources,
          },
          "Reconciliation complete",
        );

        if (!result.success) {
          logger.error({}, "Reconciliation failed with errors");
          process.exit(1);
        }

        logger.info({}, "All resources reconciled successfully");
        process.exit(0);
      } catch (error) {
        logger.fatal(
          { error: error instanceof Error ? error.message : String(error) },
          "Fatal error during reconciliation",
        );
        process.exit(1);
      }
    });

  return command;
}

/**
 * Creates the 'state' subcommand.
 */
export function createStateCommand() {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const command = new Command<[], {}, ProgramOptions>("state")
    .description("Get the current state of resources from the manifest")
    .action(async (_options, command) => {
      const globalOptions = command.optsWithGlobals();

      const env = parseEnv();
      // Mute logger for state command to only output JSON
      // @ts-expect-error TS2322 - createLogger infers LOG_LEVEL as string literal
      const logger = createLogger({ ...env, LOG_LEVEL: "silent" });

      const manifestPath = globalOptions.manifest;
      if (!manifestPath) {
        logger.fatal({}, "Manifest path is required. Use --manifest or MANIFEST_PATH env var.");
        process.exit(1);
      }

      try {
        const absolutePath = resolve(process.cwd(), manifestPath);
        const manifestContent = await readFile(absolutePath, "utf-8");
        const manifestData = JSON.parse(manifestContent);
        const manifest = parseManifest(manifestData);

        if (globalOptions.dryRun) {
          const resourceNames = manifest.resources.map((r) => r.name).join(", ");
          console.log(
            `[DRY RUN] Would introspect environment '${manifest.environmentName}' in project '${manifest.projectId}' for the following resources: ${resourceNames}`,
          );
          process.exit(0);
        }

        const client = new CoolifyClient(env.COOLIFY_ENDPOINT_URL, env.COOLIFY_TOKEN, logger, globalOptions.dryRun);

        const allowedKeys = new Set([
          "exists",
          "uuid",
          "name",
          "docker_registry_image_name",
          "docker_registry_image_tag",
          "fqdn",
          "health_check_enabled",
          "health_check_host",
          "health_check_interval",
          "health_check_method",
          "health_check_path",
          "health_check_port",
          "health_check_response_text",
          "health_check_retries",
          "health_check_return_code",
          "health_check_scheme",
          "health_check_start_period",
          "health_check_timeout",
          "last_online_at",
          "last_restart_at",
          "last_restart_type",
          "ports_exposes",
          "restart_count",
          "status",
          "created_at",
          "updated_at",
        ]);

        const resourceStates = [];
        for (const resource of manifest.resources) {
          const app = await client.findApplicationByName(resource.name);
          if (app) {
            const filtered: Record<string, unknown> = { exists: true };
            for (const key of allowedKeys) {
              if (key !== "exists" && key in app) {
                filtered[key] = (app as unknown as Record<string, unknown>)[key];
              }
            }
            resourceStates.push(filtered);
          } else {
            resourceStates.push({
              name: resource.name,
              exists: false,
            });
          }
        }

        // Output the state as JSON
        console.log(JSON.stringify(resourceStates, null, 2));
        process.exit(0);
      } catch (error) {
        logger.fatal(
          { error: error instanceof Error ? error.message : String(error) },
          "Fatal error during state retrieval",
        );
        process.exit(1);
      }
    });

  return command;
}

/**
 * Creates the 'init' subcommand.
 */
export function createInitCommand() {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const command = new Command<[], {}, ProgramOptions>("init")
    .description("Initialize a new coolify.manifest.json by scanning the monorepo")
    .option("-o, --output <path>", "Output path for the manifest file", "./coolify.manifest.json")
    .option(
      "-p, --project-id <id>",
      "Coolify project ID (for introspection of existing resources)",
      process.env.COOLIFY_PROJECT_ID,
    )
    .option(
      "-e, --environment <name>",
      "Coolify environment name (for introspection of existing resources)",
      "production",
    )
    .action(async (options) => {
      // Helper functions
      const pathExists = async (p: string): Promise<boolean> => {
        try {
          await access(p);
          return true;
        } catch {
          return false;
        }
      };

      const getExposedPort = async (dockerfilePath: string): Promise<string | null> => {
        try {
          const content = await readFile(dockerfilePath, "utf-8");
          const exposeMatch = content.match(/^EXPOSE\s+(\d+)/m);
          return exposeMatch ? exposeMatch[1] : null;
        } catch {
          return null;
        }
      };

      const getRepoInfo = (): { owner: string; name: string } | null => {
        try {
          const remoteUrl = execSync("git config --get remote.origin.url").toString().trim();
          const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)(\.git)?/);
          if (match && match[1] && match[2]) {
            return { owner: match[1], name: match[2] };
          }
          return null;
        } catch {
          return null;
        }
      };

      const getPnpmWorkspaces = (): Array<{ name: string; path: string }> => {
        try {
          const output = execSync("pnpm list -r --json --depth -1").toString();
          const workspaces = JSON.parse(output) as Array<{ name: string; path: string }>;
          return workspaces.filter((w) => w.name && w.path);
        } catch {
          console.error("Failed to get pnpm workspaces. Is pnpm installed and are you in a monorepo?");
          return [];
        }
      };

      console.log("[INFO] Scanning monorepo to generate a coolify.manifest.json...");

      const repoInfo = getRepoInfo();
      if (!repoInfo) {
        console.error("[ERROR] Could not determine GitHub repository from git remote.");
        process.exit(1);
      }

      const allWorkspaces = getPnpmWorkspaces();
      if (allWorkspaces.length === 0) {
        console.warn("[WARN] No pnpm workspaces found.");
        process.exit(0);
      }

      // Initialize Coolify client for introspection if project ID is provided
      let coolifyClient: CoolifyClient | null = null;
      const existingApps: Record<string, unknown> = {};

      if (options.projectId) {
        const env = parseEnv();
        // Mute logger for cleaner output
        // @ts-expect-error TS2322 - createLogger infers LOG_LEVEL as string literal
        const logger = createLogger({ ...env, LOG_LEVEL: "silent" });
        coolifyClient = new CoolifyClient(env.COOLIFY_ENDPOINT_URL, env.COOLIFY_TOKEN, logger);

        console.log(`[INFO] Introspecting Coolify project '${options.projectId}' for existing resources...`);

        try {
          const allApps = await coolifyClient.listApplications();
          for (const app of allApps) {
            existingApps[(app as unknown as Record<string, unknown>).name as string] = app;
          }
          console.log(`[INFO] Found ${Object.keys(existingApps).length} existing applications.`);
        } catch {
          console.warn(
            "[WARN] Failed to introspect Coolify. Will generate manifest without existing resource details.",
          );
        }
      }

      const allResources: Array<{
        name: string;
        description: string;
        dockerImageName: string;
        envSecretName: string;
        domains: string;
        portsExposes: string;
        healthCheck: { path: string; port: string };
      }> = [];

      for (const workspace of allWorkspaces) {
        const { path: absolutePath, name: pkgName } = workspace;
        const dockerfilePath = join(absolutePath, "Dockerfile");

        if (!(await pathExists(dockerfilePath))) {
          continue;
        }

        console.log(`[INFO] Processing "${pkgName}"...`);
        const packageJsonPath = join(absolutePath, "package.json");

        let pkg: { description?: string };
        try {
          const pkgContent = await readFile(packageJsonPath, "utf-8");
          pkg = JSON.parse(pkgContent);
        } catch {
          console.error(`[ERROR] Could not read package.json for "${pkgName}". Skipping.`);
          continue;
        }

        const exposedPort = await getExposedPort(dockerfilePath);
        if (!exposedPort) {
          console.warn(`[WARN] No EXPOSE instruction found in Dockerfile for "${pkgName}". Defaulting to 8080.`);
        }

        const resourceNameSuffix = pkgName.split("/")[1] || pkgName;
        const resourceName = `${repoInfo.name}-${resourceNameSuffix}`;

        // Check if resource already exists in Coolify
        const existingApp = existingApps[resourceName];
        if (existingApp) {
          console.log(`[INFO] Found existing application "${resourceName}" in Coolify.`);
          allResources.push({
            name: resourceName,
            description:
              ((existingApp as Record<string, unknown>).description as string | undefined) ||
              pkg.description ||
              `The ${resourceNameSuffix} service.`,
            dockerImageName:
              ((existingApp as Record<string, unknown>).docker_registry_image_name as string) ||
              `ghcr.io/${repoInfo.owner}/${repoInfo.name}-${resourceNameSuffix}`,
            envSecretName: `COOLIFY_ENV_${resourceNameSuffix.toUpperCase().replace(/-/g, "_")}`,
            domains: ((existingApp as Record<string, unknown>).fqdn as string) || "app.example.com",
            portsExposes: ((existingApp as Record<string, unknown>).ports_exposes as string) || exposedPort || "8080",
            healthCheck: {
              path: ((existingApp as Record<string, unknown>).health_check_path as string) || "/health",
              port: ((existingApp as Record<string, unknown>).health_check_port as string) || exposedPort || "8080",
            },
          });
        } else {
          allResources.push({
            name: resourceName,
            description: pkg.description || `The ${resourceNameSuffix} service.`,
            dockerImageName: `ghcr.io/${repoInfo.owner}/${repoInfo.name}-${resourceNameSuffix}`,
            envSecretName: `COOLIFY_ENV_${resourceNameSuffix.toUpperCase().replace(/-/g, "_")}`,
            domains: "app.example.com",
            portsExposes: exposedPort || "8080",
            healthCheck: {
              path: "/health",
              port: exposedPort || "8080",
            },
          });
        }
      }

      if (allResources.length === 0) {
        console.warn("[WARN] Scan complete. No workspaces with a Dockerfile were found. No manifest generated.");
        process.exit(0);
      }

      const rootManifest = {
        projectId: options.projectId || "clv4321dc0000g21b5c1a1a1a",
        destinationId: "clt1234ab0000g21b5c1a1b1b",
        serverUuid: "clx9876ef0000g21b5c1a1c1c",
        environmentName: options.environment,
        resources: allResources,
      };

      const manifestPath = resolve(process.cwd(), options.output);
      await writeFile(manifestPath, JSON.stringify(rootManifest, null, 2));

      console.log("[INFO] --------------------------------------------------");
      console.log(`[SUCCESS] Scan complete. Generated root manifest with ${allResources.length} resource(s).`);
      console.log(`[SUCCESS] File created at: ${manifestPath}`);
      if (!options.projectId) {
        console.warn("[WARN] ACTION REQUIRED: Open coolify.manifest.json and replace placeholder values.");
      }

      process.exit(0);
    });

  return command;
}

/**
 * Assembles the final program with all subcommands.
 */
export async function assembleProgram() {
  const program = await createProgram();
  const applyCommand = createApplyCommand();
  const stateCommand = createStateCommand();
  const initCommand = createInitCommand();
  program.addCommand(applyCommand);
  program.addCommand(stateCommand);
  program.addCommand(initCommand);
  return program;
}
