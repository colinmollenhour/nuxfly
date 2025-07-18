# Nuxfly Monorepo

This monorepo contains the Nuxfly CLI and Nuxt module for deploying Nuxt applications to Fly.io.

## Packages

### [@nuxfly/cli](./packages/cli)
CLI tool for deploying Nuxt applications to Fly.io with integrated storage and database support.

### [@nuxfly/core](./packages/core)
Nuxt module that provides runtime composables for Fly.io integration including SQLite database, public/private storage, and proxy functionality.

## Development

### Install Dependencies
```bash
pnpm install
```

### Build All Packages
```bash
pnpm build
```

### Build Individual Packages
```bash
# Build CLI
cd packages/cli && pnpm build

# Build Core Module
cd packages/core && pnpm build
```

## Publishing

### GitHub Releases

Both packages have been released to GitHub with the following tags:
- **@nuxfly/core**: `core-v1.0.0`
- **@nuxfly/cli**: `cli-v1.0.0`

### Manual Release Process

To create new releases:

1. **Build packages**: `pnpm build`
2. **Create tags**:
   ```bash
   git tag core-v1.0.1 -m "@nuxfly/core v1.0.1"
   git tag cli-v1.0.1 -m "@nuxfly/cli v1.0.1"
   ```
3. **Push tags**: `git push origin core-v1.0.1 cli-v1.0.1`

### NPM Publishing (Optional)

If you want to publish to npm:

#### Build and Publish Core Module First
```bash
cd packages/core
pnpm build
npm publish
```

#### Build and Publish CLI
```bash
cd packages/cli
pnpm build
npm publish
```

### Release-it Configuration

The project includes release-it configurations for automated releases, but they're currently set to skip npm publishing. You can modify the `.release-it.json` files to enable npm publishing when ready.

## Project Structure

```
nuxfly/
├── packages/
│   ├── cli/                     # @nuxfly/cli - CLI tool
│   │   ├── src/
│   │   │   ├── index.mjs        # CLI entry point
│   │   │   ├── commands/        # CLI commands
│   │   │   ├── templates/       # Template files
│   │   │   └── utils/           # CLI utilities
│   │   └── dist/                # Built CLI
│   │
│   └── core/                    # @nuxfly/core - Nuxt module
│       ├── src/
│       │   ├── module.ts        # Nuxt module entry
│       │   └── runtime/         # Runtime composables
│       └── dist/                # Built module
│
├── playground/                  # Testing environment
├── package.json                 # Root workspace config
└── pnpm-workspace.yaml         # PNPM workspace config