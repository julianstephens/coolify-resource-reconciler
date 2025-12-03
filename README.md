# Coolify Deploy

A lightweight Infrastructure as Code (IaC) tool for managing and deploying Docker applications to Coolify. It allows you to define your applications in a JSON manifest and uses a reconciler to handle the creation, updates, and deployments. Key features include the ability to generate a manifest by scanning your repository for Dockerfiles, support for prebuilt Docker images, management of environment variables, and structured logging for all operations. The tool also offers a dry-run mode to test deployments without making live changes and is idempotent, ensuring that repeated runs will not cause unintended side effects.

## Features

- **Declarative Deployment**: Define your applications in a JSON manifest and let the reconciler handle creation, updates, and deployments.
- **Manifest Generation**: Scan your repository for `Dockerfile`s and generate a manifest with optional introspection of your Coolify environment.
- **Docker Image Support**: Works with prebuilt Docker images from container registries like GHCR.
- **Environment Variable Management**: Parse `.env` formatted secrets and apply them to applications.
- **Structured Logging**: All operations are logged in JSON format.
- **Dry Run Mode**: Test your deployments without making actual changes.
- **Idempotent**: Safe to run multiple times; creates new applications or updates existing ones as needed.

## Installation

```bash
pnpm add -g coolify-deploy
```

## Usage

This tool provides three main commands: `init` to generate a manifest, `apply` to deploy it, and `state` to inspect it.

### Global Options

These options can be used with any command.

```
--manifest <path>  Path to coolify.manifest.json file (default: ./coolify.manifest.json)
--dry-run          Run without making changes
```

### 1. `init` - Generate a Manifest

The `init` command scans your repository for `Dockerfile`s and generates a `coolify.manifest.json` file. It can optionally introspect your Coolify environment to auto-fill configuration details from existing applications.

#### `init` Options

```
init [options]

Options:
  -o, --output <path>        Path to save manifest (default: ./coolify.manifest.json)
  -p, --project-id <id>      Coolify project ID (enables introspection)
  -e, --environment <name>   Target environment name (default: production)
```

#### `init` Examples

**Option 1: Generate Manifest with Defaults**

```bash
# Run from your repository root
cdeploy init
```

This creates a `coolify.manifest.json` with placeholder values.

**Option 2: Generate Manifest with Coolify Introspection**

```bash
# Set environment variables
export COOLIFY_ENDPOINT_URL="https://coolify.example.com"
export COOLIFY_TOKEN="your-api-token-here"

# Run init with your project ID
cdeploy init \
  --project-id "your-project-id" \
  --environment production
```

The manifest will be auto-populated with real values from matching applications in your Coolify project.

### 2. `apply` - Apply a Manifest

The `apply` command reads a manifest and reconciles the state of your applications in Coolify. It will create, update, and deploy applications as needed.

#### `apply` Options

```
apply [options]

Options:
  -t, --tag <tag>        Docker image tag to deploy (e.g., "latest" or "v1.0.0")
  -s, --server-uuid <uuid> Coolify server UUID (overrides manifest)
```

#### `apply` Examples

```bash
# Basic usage
cdeploy --manifest ./coolify.manifest.json apply --tag v1.0.0

# With dry run
cdeploy --manifest ./coolify.manifest.json apply --tag latest --dry-run
```

### 3. `state` - Inspect Resource State

After applying a manifest, you can use the `state` command to fetch and display the current configuration of your resources from Coolify.

#### `state` Examples

```bash
# Inspect resources defined in the default manifest
cdeploy state

# Inspect resources from a specific manifest
cdeploy --manifest ./path/to/your/manifest.json state
```

## Manifest Format

The `coolify.manifest.json` file declares the desired state of your resources.

```json
{
  "projectId": "your-coolify-project-uuid",
  "destinationId": "your-coolify-destination-uuid",
  "serverUuid": "your-coolify-server-uuid",
  "environmentName": "production",
  "resources": [
    {
      "name": "my-app-server",
      "description": "The server for my-app.",
      "dockerImageName": "ghcr.io/owner/my-app-server",
      "envSecretName": "COOLIFY_ENV_MY_APP_SERVER",
      "domains": "api.example.com",
      "portsExposes": "3000",
      "healthCheck": {
        "path": "/health",
        "port": "3000"
      }
    }
  ]
}
```

## Environment Variables

| Variable               | Required | Description                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `COOLIFY_ENDPOINT_URL` | Yes      | Coolify server base URL                                                  |
| `COOLIFY_TOKEN`        | Yes      | Coolify API token                                                        |
| `MANIFEST_PATH`        | No       | Path to manifest file (can use CLI arg)                                  |
| `DOCKER_IMAGE_TAG`     | No       | Docker image tag to deploy (can use CLI arg)                             |
| `COOLIFY_ENV_*`        | No       | `.env` formatted content for an application (e.g., `COOLIFY_ENV_MY_APP`) |
| `LOG_LEVEL`            | No       | Log level: trace, debug, info, warn, error, fatal (default: info)        |
| `DRY_RUN`              | No       | Set to "true" for dry run mode                                           |

## Library Usage

You can also use this package as a library:

```typescript
import { CoolifyClient, Reconciler, parseManifest } from "coolify-deploy";

// Parse manifest
const manifest = parseManifest(manifestData);

// Create client
const client = new CoolifyClient(apiUrl, token, logger, dryRun);

// Create and run reconciler
const reconciler = new Reconciler(client, logger, {
  manifest,
  dockerTag: "v1.0.0",
  envSecrets: {
    COOLIFY_ENV_MY_APP_SERVER: "...",
    COOLIFY_ENV_MY_APP_CLIENT: "...",
  },
});

const result = await reconciler.reconcile();
console.log(result.success, result.totalCreated, result.totalUpdated);
```

## GitHub Actions Integration

```yaml
- name: Run Coolify deploy tool
  env:
    COOLIFY_ENDPOINT_URL: ${{ secrets.COOLIFY_ENDPOINT_URL }}
    COOLIFY_TOKEN: ${{ secrets.COOLIFY_TOKEN }}
    COOLIFY_ENV_MY_APP_SERVER: ${{ secrets.COOLIFY_ENV_MY_APP_SERVER }}
    MANIFEST_PATH: ./coolify.manifest.json
    DOCKER_IMAGE_TAG: latest
  run: |
    cdeploy apply \
      --manifest "$MANIFEST_PATH" \
      --tag "$DOCKER_IMAGE_TAG"
```

### Required GitHub Secrets

| Secret                 | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `COOLIFY_ENDPOINT_URL` | Coolify server base URL (e.g., `https://coolify.example.com`)       |
| `COOLIFY_TOKEN`        | Coolify API token (from Keys & Tokens in Coolify dashboard)         |
| `COOLIFY_ENV_*`        | `.env` formatted content for an application's environment variables |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

## License

[MIT](./LICENSE)
