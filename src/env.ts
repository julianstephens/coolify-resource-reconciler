import { z } from "zod";

export const envSchema = z.object({
  COOLIFY_ENDPOINT_URL: z.string().min(1).describe("Coolify server base URL"),
  COOLIFY_TOKEN: z.string().min(1).describe("Coolify API token"),
  MANIFEST_PATH: z.string().min(1).optional(),
  DOCKER_IMAGE_TAG: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DRY_RUN: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1")
    .describe("Dry run mode"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      JSON.stringify({
        level: "fatal",
        service: "coolify-deploy",
        msg: "Invalid environment variables",
        errors: parsed.error.format(),
      }),
    );
    process.exit(1);
  }

  return parsed.data;
}
