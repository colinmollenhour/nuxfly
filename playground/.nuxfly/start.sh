#!/bin/bash
set -e

DATABASE_PATH=${DATABASE_PATH:-"/data/db.sqlite"}
DRIZZLE_CMD="npx drizzle-kit migrate"

# Function to check and run migrations if version changed
check_and_migrate() {
    echo "Checking for version changes..."
    
    # Get current version from environment
    CURRENT_VERSION=${FLY_MACHINE_VERSION:-"unknown"}
    echo "Current FLY_MACHINE_VERSION: $CURRENT_VERSION"
    
    # Create fly table if it doesn't exist
    sqlite3 $DATABASE_PATH "CREATE TABLE IF NOT EXISTS fly (
        id INTEGER PRIMARY KEY,
        machine_version TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );"
    
    # Get stored version from database
    STORED_VERSION=$(sqlite3 $DATABASE_PATH "SELECT machine_version FROM fly ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "")
    echo "Stored version: ${STORED_VERSION:-"none"}"
    
    # Check if version has changed
    if [ "$CURRENT_VERSION" != "$STORED_VERSION" ]; then
        echo "Version changed from '${STORED_VERSION:-"none"}' to '$CURRENT_VERSION'"
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
        CURRENT_VERSION=${FLY_MACHINE_VERSION:-"unknown"}
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
if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo "AWS_ACCESS_KEY_ID is not set, skipping litestream backup!!"
    exec node dist/index.mjs
else
    export NUXT_NUXFLY_S3_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
    export NUXT_NUXFLY_S3_SECRET_ACCESS_KEY=$AWS_ENDPOINT_URL_S3
    export NUXT_NUXFLY_S3_ENDPOINT=$AWS_ENDPOINT_URL_S3
    export NUXT_NUXFLY_S3_BUCKET=$BUCKET_NAME
    export NUXT_NUXFLY_S3_REGION=${AWS_REGION:-"auto"}
    echo "Starting Litestream with Node.js application..."
    exec litestream replicate -config /etc/litestream.yml -exec "node dist/index.mjs"
fi
