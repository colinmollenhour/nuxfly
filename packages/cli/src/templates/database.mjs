/**
 * Generate database-related configuration files
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileExists } from '../utils/filesystem.mjs';

/**
 * Extract drizzle versions from project package.json
 */
async function getDrizzleVersions() {
  const packageJsonPath = join(process.cwd(), 'package.json');
  
  if (!fileExists(packageJsonPath)) {
    return {
      drizzleKitVersion: '^0.31.3',
      drizzleOrmVersion: '^0.44.2'
    };
  }
  
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    return {
      drizzleKitVersion: dependencies['drizzle-kit'] || '^0.31.3',
      drizzleOrmVersion: dependencies['drizzle-orm'] || '^0.44.2'
    };
  } catch (error) {
    console.warn('Failed to read package.json, using default drizzle versions:', error.message);
    return {
      drizzleKitVersion: '^0.31.3',
      drizzleOrmVersion: '^0.44.2'
    };
  }
}

/**
 * Generate drizzle.config.ts content
 */
export function generateDrizzleConfig() {

  return `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "/data/db.sqlite",
  },
});
`;
}

/**
 * Generate litestream.yml content
 */
export function generateLitestreamConfig(config = {}) {
  const syncInterval = config.syncInterval || '30s';
  const retention = config.retention || '96h';
  const snapshotInterval = config.snapshotInterval || '2h';

  return `dbs:
  - path: /data/db.sqlite
    meta-path: /data/db.litestream-meta
    replicas:
      - type: s3
        bucket: \${LITESTREAM_S3_BUCKET_NAME}
        path: litestream/
        endpoint: \${LITESTREAM_S3_ENDPOINT_URL}
        region: \${LITESTREAM_S3_REGION}
        access-key-id: \${LITESTREAM_S3_ACCESS_KEY_ID}
        secret-access-key: \${LITESTREAM_S3_SECRET_ACCESS_KEY}
        # Sync every 30 seconds for near real-time backup
        sync-interval: ${syncInterval}
        # Retain snapshots for 4 days
        retention: ${retention}
        # Snapshot interval - create full snapshots every hour
        snapshot-interval: ${snapshotInterval}
`;
}

/**
 * Generate start.sh content
 */
export function generateStartScript() {
  return `#!/bin/bash
set -e

DATABASE_PATH=\${DATABASE_PATH:-"/data/db.sqlite"}
DRIZZLE_CMD="npx drizzle-kit migrate"

# Function to check and run migrations if version changed
check_and_migrate() {
    echo "Checking for version changes..."
    
    # Get current version from environment
    CURRENT_VERSION=\${FLY_MACHINE_VERSION:-"unknown"}
    echo "Current FLY_MACHINE_VERSION: $CURRENT_VERSION"
    
    # Create fly table if it doesn't exist
    sqlite3 $DATABASE_PATH "CREATE TABLE IF NOT EXISTS fly (
        id INTEGER PRIMARY KEY,
        machine_version TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );"
    
    # Get stored version from database
    STORED_VERSION=$(sqlite3 $DATABASE_PATH "SELECT machine_version FROM fly ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "")
    echo "Stored version: \${STORED_VERSION:-"none"}"
    
    # Check if version has changed
    if [ "$CURRENT_VERSION" != "$STORED_VERSION" ]; then
        echo "Version changed from '\${STORED_VERSION:-"none"}' to '$CURRENT_VERSION'"
        echo "Running database migrations..."
        
        cd /app/dist/db/
        DATABASE_PATH=$DATABASE_PATH $DRIZZLE_CMD
        
        # Update stored version in database
        if [ -z "$STORED_VERSION" ]; then
            # Insert first record
            sqlite3 $DATABASE_PATH "INSERT INTO fly (machine_version) VALUES ('$CURRENT_VERSION');"
        else
            # Insert new record (keeping history)
            sqlite3 $DATABASE_PATH "INSERT INTO fly (machine_version) VALUES ('$CURRENT_VERSION');"
        fi
        
        echo "Version updated to: $CURRENT_VERSION"
    else
        echo "Version unchanged, skipping migrations"
    fi
}

# Check if database exists, if not, restore from backup
if [ ! -f $DATABASE_PATH ]; then
    echo "Database not found, attempting to restore from backup..."
    if litestream restore -config /etc/litestream.yml $DATABASE_PATH; then
        echo "Database restored successfully from backup"
        # Check for version changes after restore
        check_and_migrate
    else
        echo "No backup found or restore failed, will start with fresh database"
        mkdir -p $(dirname $DATABASE_PATH)
        echo "Running database migrations..."
        cd /app/dist/db/
        DATABASE_PATH=$DATABASE_PATH $DRIZZLE_CMD
        
        # Initialize version tracking for new database
        CURRENT_VERSION=\${FLY_MACHINE_VERSION:-"unknown"}
        sqlite3 $DATABASE_PATH "CREATE TABLE IF NOT EXISTS fly (
            id INTEGER PRIMARY KEY,
            machine_version TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );"
        sqlite3 $DATABASE_PATH "INSERT INTO fly (machine_version) VALUES ('$CURRENT_VERSION');"
        echo "Initialized version tracking with: $CURRENT_VERSION"
    fi
else
    # Database exists, check for version changes
    check_and_migrate
fi

# Start Litestream with exec - this will start replication and run the Node.js app
# We map the default environment variables to the Nuxt runtime config equivalents
cd /app

export NUXT_NUXFLY_DB_URL="file:$DATABASE_PATH"

if [ -z "$LITESTREAM_S3_ACCESS_KEY_ID" ]; then
    echo "LITESTREAM_S3_ACCESS_KEY_ID is not set, skipping litestream backup!!"
    exec node dist/index.mjs
else
    echo "Starting Litestream with Node.js application..."
    exec litestream replicate -config /etc/litestream.yml -exec "node dist/index.mjs"
fi
`;
}

/**
 * Generate package.json for drizzle-kit installation
 */
export async function generateDrizzlePackageJson(config = {}) {
  const versions = await getDrizzleVersions();
  const drizzleKitVersion = config.drizzleKitVersion || versions.drizzleKitVersion;
  const drizzleOrmVersion = config.drizzleOrmVersion || versions.drizzleOrmVersion;

  return JSON.stringify({
    "name": "nuxfly-db",
    "private": true,
    "scripts": {
      "migrate": "drizzle-kit migrate"
    },
    "dependencies": {
      "drizzle-kit": drizzleKitVersion,
      "drizzle-orm": drizzleOrmVersion
    }
  }, null, 2);
}