## v0.2.0

- Enforces strict validation on the manifest file. This ensures that typos in configuration keys (like `healthcheck` instead of `healthCheck`) are caught immediately instead of being silently ignored.
- Adds debug logging for application update payloads to help troubleshoot configuration issues.

## v0.1.8

- Optimizes deployment polling to run concurrently. Instead of waiting for each application to finish deploying one by one, the tool now triggers all deployments first and then waits for them in parallel, significantly reducing total runtime.
- Fixes "Validation failed" error when creating or updating applications with empty `portsExposes` in the manifest. The tool now correctly omits the field instead of sending an empty string.

## v0.1.7

- Improves error messages for API permission errors (401/403) to explicitly suggest checking token scopes.
- Fixes deployment trigger error "You can only use uuid or tag, not both" by removing the redundant `tag` parameter when deploying by `uuid`.

## v0.1.6

- Extends types to match API documentation
- Fixes issue where internal API client crashed on successful but empty response
- Fixes issue where deployments were not triggered after creating or updating
- Fixes issue where deployments accidentally target the wrong application if multiple apps share the same name across different environments (e.g., "api" in both Staging and Production)
- Fixes issue where dry-run mode failed with "Target environment does not exist" error.
- Improves dry-run mode to perform real read-only API calls (list applications, environments, etc.) instead of returning mock data. This allows the dry-run to accurately predict whether resources will be created or updated based on the actual server state. In addition, the tool now prints a summary table of changes (Created, Updated, Pruned, Failed) when running in dry-run mode, acting as a "plan" or "drift detection" feature.
- Adds deployment status polling. The tool now waits for deployments to finish (or fail) before exiting, ensuring that CI pipelines accurately reflect the deployment outcome.
- Adds resource pruning. Applications that exist in the target environment but are not defined in the manifest will now be deleted. This ensures the environment exactly matches the manifest.

## v0.1.5

- Renames `serverUuid` to `serverId` in manifest for consistent resource identification
- Adds server and destination introspection to the `init` command
- Fixes issue where CLI crashes on null list return from the API
- Fixes issue where reconciliation flow used improper app creation/update methods
- Aligns test suite with codebase for proper coverage

## v0.1.4

- Fixes reconciliation logic to correctly handle resources that lack optional networking properties

## v0.1.3

- Fixes issue where networking configuration was always required.

## v0.1.2

- Fixes an issue where the `init` command included the `.git` extension in generated resource names. The git remote parsing logic was updated to correctly strip the extension.

## v0.1.1

- Fixes issue where CLI could not be executed globally. A missing shebang (`#!/usr/bin/env node`) was added to the build output, resolving permission and command-not-found errors.

## ~~v0.1.0~~ (Yanked)
