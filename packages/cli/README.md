# @nuxfly/cli

A powerful CLI tool for deploying Nuxt applications to Fly.io with integrated SQLite and S3 storage support.

> [!WARNING]
> This project is in early development and may not be fully functional yet.

## Features

- 🚀 **One-command deployment** - Deploy Nuxt apps to Fly.io with automatic infrastructure setup
- 🗄️ **SQLite integration** - Automatic SQLite database continuous backup via Litestream
- 🌧 **Drizzle integration** - Automatically applies Drizzle migrations on deployment
- 📦 **Tigris (S3) storage** - Zero configuration to provision and access public and private file storage buckets
- 🔄 **Import existing apps** - Seamlessly import and configure existing Fly.io applications
- 🔧 **Database management** - Integrated Drizzle Studio for database operations

## Installation

```bash
npm install -g @nuxfly/cli
```

## Quick Start

```bash
# Create and deploy a new Nuxt app
nuxfly launch --name my-app

# Deploy an existing project
nuxfly deploy

# Open database studio
nuxfly studio

# Generate deployment files only
nuxfly generate
```

## Commands

### `nuxfly launch <name>`
Create and configure a new Nuxt application with Fly.io deployment setup.

**Options:**
- `--template <template>` - Project template (default: "default")
- `--region <region>` - Fly.io region (default: "iad")
- `--no-database` - Skip database setup
- `--no-storage` - Skip storage setup

### `nuxfly deploy`
Deploy your application to Fly.io with automatic infrastructure provisioning.

**Options:**
- `--build-only` - Only build, don't deploy
- `--no-cache` - Disable build cache
- `--strategy <strategy>` - Deployment strategy

### `nuxfly generate`
Generate Fly.io deployment configuration files.

**Options:**
- `--force` - Overwrite existing files
- `--template <template>` - Configuration template

### `nuxfly studio`
Launch Drizzle Studio for database management.

**Options:**
- `--port <port>` - Studio port (default: 4983)
- `--host <host>` - Studio host (default: "localhost")

### `nuxfly import <app-name>`
Import an existing Fly.io application and set up local development.

### `nuxfly proxy <command>`
Proxy commands to flyctl with nuxfly context.

## Requirements

- Node.js 18+
- Fly.io account and flyctl installed
- Git (for project creation)

## Documentation

For detailed documentation, visit: [nuxfly documentation](https://nuxfly.dev)

## License

MIT