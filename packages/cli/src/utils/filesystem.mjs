import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { cp } from 'fs/promises';
import consola from 'consola';
import { loadConfig } from 'c12';
import { NuxflyError, PermissionError, withErrorHandling } from './errors.mjs';
import { getNuxflyDir } from './config.mjs';

/**
 * Ensure the .nuxfly directory exists
 */
export const ensureNuxflyDir = withErrorHandling(async (config) => {
  const nuxflyDir = getNuxflyDir(config);
  
  if (!existsSync(nuxflyDir)) {
    consola.debug(`Creating .nuxfly directory: ${nuxflyDir}`);
    mkdirSync(nuxflyDir, { recursive: true });
  }
  
  return nuxflyDir;
});

/**
 * Write content to a file, creating directories as needed
 */
export const writeFile = withErrorHandling(async (filepath, content) => {
  const dir = dirname(filepath);
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  try {
    writeFileSync(filepath, content, 'utf8');
    consola.debug(`Written file: ${filepath}`);
    return filepath;
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new PermissionError(filepath);
    }
    throw new NuxflyError(`Failed to write file ${filepath}: ${error.message}`);
  }
});

/**
 * Read file content safely
 */
export const readFile = withErrorHandling((filepath) => {
  try {
    return readFileSync(filepath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError(`File not found: ${filepath}`);
    }
    if (error.code === 'EACCES') {
      throw new PermissionError(filepath);
    }
    throw new NuxflyError(`Failed to read file ${filepath}: ${error.message}`);
  }
});

/**
 * Copy a single file
 */
export const copyFile = withErrorHandling((src, dest) => {
  const destDir = dirname(dest);
  
  // Ensure destination directory exists
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  try {
    copyFileSync(src, dest);
    consola.debug(`Copied file: ${src} -> ${dest}`);
    return dest;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError(`Source file not found: ${src}`);
    }
    if (error.code === 'EACCES') {
      throw new PermissionError(src);
    }
    throw new NuxflyError(`Failed to copy file ${src} to ${dest}: ${error.message}`);
  }
});

/**
 * Check if a file exists and is readable
 */
export function fileExists(filepath) {
  try {
    return existsSync(filepath) && statSync(filepath).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export function directoryExists(dirpath) {
  try {
    return existsSync(dirpath) && statSync(dirpath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get relative path from cwd
 */
export function getRelativePath(filepath) {
  return relative(process.cwd(), filepath);
}

/**
 * Remove directory recursively (Node.js 14+ has rmSync, but we'll use a compatible approach)
 */
async function removeDirectory(dirpath) {
  if (!existsSync(dirpath)) {
    return;
  }
  
  const { rm } = await import('fs/promises');
  await rm(dirpath, { recursive: true, force: true });
}

/**
 * Create backup of a file
 */
export const backupFile = withErrorHandling((filepath) => {
  if (!fileExists(filepath)) {
    return null;
  }
  
  const backupPath = `${filepath}.backup`;
  copyFile(filepath, backupPath);
  consola.debug(`Created backup: ${backupPath}`);
  return backupPath;
});

/**
 * Restore file from backup
 */
export const restoreFromBackup = withErrorHandling((filepath) => {
  const backupPath = `${filepath}.backup`;
  
  if (!fileExists(backupPath)) {
    throw new NuxflyError(`No backup found for ${filepath}`);
  }
  
  copyFile(backupPath, filepath);
  consola.debug(`Restored from backup: ${backupPath} -> ${filepath}`);
  return filepath;
});

/**
 * Get file modification time
 */
export function getFileModTime(filepath) {
  try {
    return statSync(filepath).mtime;
  } catch {
    return null;
  }
}

/**
 * Check if source is newer than target
 */
export function isNewer(sourcePath, targetPath) {
  const sourceTime = getFileModTime(sourcePath);
  const targetTime = getFileModTime(targetPath);
  
  if (!sourceTime || !targetTime) {
    return true; // If either doesn't exist, consider source newer
  }
  
  return sourceTime > targetTime;
}

/**
 * Safe file operations with atomic writes
 */
export const atomicWrite = withErrorHandling(async (filepath, content) => {
  const tempPath = `${filepath}.tmp`;
  
  try {
    // Write to temporary file first
    await writeFile(tempPath, content);
    
    // Move temp file to final location (atomic on most filesystems)
    copyFile(tempPath, filepath);
    
    // Clean up temp file
    if (existsSync(tempPath)) {
      const { unlink } = await import('fs/promises');
      await unlink(tempPath);
    }
    
    return filepath;
  } catch (error) {
    // Clean up temp file on error
    if (existsSync(tempPath)) {
      try {
        const { unlink } = await import('fs/promises');
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
});

/**
 * Load drizzle config and get migrations output directory
 */
export const getDrizzleMigrationsPath = withErrorHandling(async () => {
  try {
    consola.debug('Loading drizzle config...');
    
    // Try to load drizzle.config.ts first
    const { config } = await loadConfig({
      name: 'drizzle.config',
      cwd: process.cwd(),
      configFile: 'drizzle.config.ts',
      defaults: {},
    });
    
    consola.debug('Loaded drizzle config:', config);
    
    if (!config || !config.out) {
      consola.debug('No drizzle config found or no "out" property specified');
      return null;
    }
    
    const migrationsPath = join(process.cwd(), config.out);
    consola.debug(`Checking migrations path: ${migrationsPath}`);
    
    if (!directoryExists(migrationsPath)) {
      consola.debug(`Migrations directory does not exist: ${migrationsPath}`);
      return null;
    }
    
    consola.debug(`Found drizzle migrations path: ${migrationsPath}`);
    return migrationsPath;
  } catch (error) {
    consola.debug(`Failed to load drizzle config: ${error.message}`);
    return null;
  }
});

/**
 * Copy drizzle migrations from parent project to .nuxfly directory
 */
export const copyDrizzleMigrations = withErrorHandling(async (config) => {
  const migrationsPath = await getDrizzleMigrationsPath();
  
  if (!migrationsPath) {
    consola.debug('No drizzle migrations found to copy');
    return false;
  }
  
  const nuxflyDir = getNuxflyDir(config);
  const targetMigrationsPath = join(nuxflyDir, 'migrations');
  
  consola.info('📦 Copying drizzle migrations...');
  consola.debug(`Copying migrations from ${migrationsPath} to ${targetMigrationsPath}`);
  
  try {
    // Remove existing migrations directory if it exists
    if (existsSync(targetMigrationsPath)) {
      await removeDirectory(targetMigrationsPath);
    }
    
    // Copy migrations directory recursively
    await cp(migrationsPath, targetMigrationsPath, { recursive: true, verbatimSymlinks: true });
    consola.success('✅ Copied drizzle migrations to .nuxfly/migrations');
    return true;
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new PermissionError(migrationsPath);
    }
    throw new NuxflyError(`Failed to copy drizzle migrations: ${error.message}`);
  }
});