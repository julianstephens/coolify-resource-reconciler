import pino from "pino";
import type { Env } from "./env.js";

const SERVICE_NAME = "coolify-resource-reconciler";

/**
 * Creates a structured pino logger for the resource reconciler.
 * Outputs JSON to stdout for integration with log aggregation systems.
 */
export function createLogger(env: Env): pino.Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: SERVICE_NAME,
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export type Logger = pino.Logger;
