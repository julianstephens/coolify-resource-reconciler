import { assembleProgram } from "./program.js";

async function main() {
  const program = await assembleProgram();
  program.parse(process.argv);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      service: "coolify-resource-reconciler",
      msg: "Unhandled error in main",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
});
