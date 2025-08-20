import consola from 'consola';
import { validateDeploymentConfig } from '../utils/validation.mjs';
import { withErrorHandling, NuxflyError } from '../utils/errors.mjs';
import { getAppName } from '../utils/config.mjs';
import { validatePort } from '../utils/validation.mjs';

/**
 * Studio command - Opens Drizzle Studio with secure tunnel to database
 */
export const studio = withErrorHandling(async (args, config) => {
  consola.info('🔧 Setting up Drizzle Studio...');
  
  // Validate deployment configuration
  await validateDeploymentConfig(config);
  
  const appName = getAppName(config);
  if (!appName) {
    throw new NuxflyError('App name is required for studio command', {
      suggestion: 'Set app name in your nuxfly config or use --app flag',
    });
  }
  
  // Default ports
  const localPort = validatePort(args.port || 4983, 'local port');
  const remotePort = validatePort(args['remote-port'] || 5432, 'remote port');
  
  try {
    // Check if drizzle-kit is available
    await validateDrizzleKit();
    
    // Set up SSH tunnel in the background
    consola.info(`Setting up secure tunnel to ${appName}...`);
    await setupTunnel(appName, localPort, remotePort);
    
    // Wait a moment for tunnel to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Display tunnel information
    displayTunnelInfo(appName, localPort, remotePort);
    
    // Launch Drizzle Studio
    consola.info('🚀 Launching Drizzle Studio...');
    await launchDrizzleStudio(localPort, config);
    
  } catch (error) {
    if (error.exitCode === 130) {
      // User cancelled (Ctrl+C)
      consola.info('Studio session cancelled by user');
      return;
    }
    
    throw new NuxflyError(`Studio setup failed: ${error.message}`, {
      suggestion: 'Check that your app is running and database is accessible',
      cause: error,
    });
  }
});

/**
 * Validate drizzle-kit is available
 */
async function validateDrizzleKit() {
  try {
    const { execa } = await import('execa');
    await execa('drizzle-kit', ['--version'], { stdio: 'pipe' });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new NuxflyError('drizzle-kit not found', {
        suggestion: 'Install drizzle-kit: npm install -g drizzle-kit',
        exitCode: 127,
      });
    }
    // If drizzle-kit exists but version command fails, still return true
    return true;
  }
}

/**
 * Set up SSH tunnel to database
 */
async function setupTunnel(appName, localPort, remotePort) {
  const tunnelArgs = [
    'proxy',
    `${localPort}:localhost:${remotePort}`,
    '--app', appName,
  ];
  
  consola.debug(`Setting up tunnel: flyctl ${tunnelArgs.join(' ')}`);
  
  try {
    // Start tunnel process in background
    const { execa } = await import('execa');
    const tunnelProcess = execa('flyctl', tunnelArgs, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        FLY_ACCESS_TOKEN: process.env.FLY_ACCESS_TOKEN || process.env.FLY_API_TOKEN || undefined,
      },
    });
    
    // Handle tunnel process cleanup
    const cleanup = () => {
      if (tunnelProcess && !tunnelProcess.killed) {
        consola.info('Closing tunnel...');
        tunnelProcess.kill('SIGTERM');
      }
    };
    
    // Register cleanup handlers
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    // Check if tunnel started successfully
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tunnel setup timeout'));
      }, 10000);
      
      tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Proxying') || output.includes('localhost')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      tunnelProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      tunnelProcess.on('exit', (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Tunnel process exited with code ${code}`));
        }
      });
    });
    
    return tunnelProcess;
    
  } catch (error) {
    throw new NuxflyError(`Failed to setup tunnel: ${error.message}`, {
      suggestion: 'Check that flyctl is installed and you have access to the app',
      cause: error,
    });
  }
}

/**
 * Launch Drizzle Studio
 */
async function launchDrizzleStudio(localPort, config) {
  try {
    const { execa } = await import('execa');
    
    // Prepare drizzle-kit studio command
    const studioArgs = [
      'studio',
      '--port', localPort.toString(),
      '--host', '0.0.0.0',
    ];
    
    // Add config file if specified
    if (config.drizzle?.config) {
      studioArgs.push('--config', config.drizzle.config);
    }
    
    consola.debug(`Launching: drizzle-kit ${studioArgs.join(' ')}`);
    
    // Start Drizzle Studio
    const studioProcess = execa('drizzle-kit', studioArgs, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    
    // Handle studio process cleanup
    const cleanup = () => {
      if (studioProcess && !studioProcess.killed) {
        consola.info('Closing Drizzle Studio...');
        studioProcess.kill('SIGTERM');
      }
    };
    
    // Register cleanup handlers
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    // Wait for studio process
    await studioProcess;
    
  } catch (error) {
    throw new NuxflyError(`Failed to launch Drizzle Studio: ${error.message}`, {
      suggestion: 'Check that drizzle-kit is properly installed and configured',
      cause: error,
    });
  }
}

/**
 * Display tunnel information
 */
function displayTunnelInfo(appName, localPort, remotePort) {
  consola.box({
    title: '🔒 Secure tunnel established',
    message: `Connected to ${appName} database

Local port: ${localPort}
Remote port: ${remotePort}
Database URL: postgresql://localhost:${localPort}/your-database

Drizzle Studio will be available at:
http://localhost:${localPort}

Press Ctrl+C to close the tunnel and studio`,
    style: {
      borderColor: 'blue',
      padding: 1,
    },
  });
}