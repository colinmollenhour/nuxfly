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

This project uses [release-it](https://github.com/release-it/release-it) for automated releases and GitHub releases.

### Release Individual Packages

#### Release Core Module
```bash
pnpm release:core
```

#### Release CLI
```bash
pnpm release:cli
```

### Manual Publishing (Alternative)

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

### Release Process

1. **Core Module**: Always release `@nuxfly/core` first since the CLI depends on it
2. **CLI**: Release `@nuxfly/cli` after the core module is published
3. **GitHub Releases**: Each package creates separate GitHub releases with tags:
   - Core: `core-v1.0.0`
   - CLI: `cli-v1.0.0`

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