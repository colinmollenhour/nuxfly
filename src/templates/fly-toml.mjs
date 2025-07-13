/**
 * Generate fly.toml content from nuxfly configuration
 */
export function generateFlyToml(config = {}) {
  const {
    app,
    region = 'ord',
    memory = '512mb',
    instances = { min: 1, max: 3 },
    env = {},
    volumes = [],
    build = {},
  } = config;

  let toml = '';

  // App configuration
  if (app) {
    toml += `app = "${app}"\n`;
  }
  toml += `primary_region = "${region}"\n\n`;

  // Build configuration
  toml += '[build]\n';
  if (build.dockerfile) {
    toml += `  dockerfile = "${build.dockerfile}"\n`;
  } else {
    toml += '  dockerfile = ".nuxfly/Dockerfile"\n';
  }
  toml += '\n';

  // HTTP service configuration
  toml += '[[services]]\n';
  toml += '  protocol = "tcp"\n';
  toml += '  internal_port = 3000\n';
  toml += '  processes = ["app"]\n\n';

  // HTTP service ports
  toml += '  [[services.ports]]\n';
  toml += '    port = 80\n';
  toml += '    handlers = ["http"]\n';
  toml += '    force_https = true\n\n';

  toml += '  [[services.ports]]\n';
  toml += '    port = 443\n';
  toml += '    handlers = ["tls", "http"]\n\n';

  // HTTP service health checks
  toml += '  [services.http_checks]\n';
  toml += '    [services.http_checks.health]\n';
  toml += '      grace_period = "5s"\n';
  toml += '      interval = "10s"\n';
  toml += '      method = "GET"\n';
  toml += '      path = "/"\n';
  toml += '      timeout = "5s"\n\n';

  // Process configuration
  toml += '[[processes]]\n';
  toml += '  name = "app"\n';
  toml += '  entrypoint = ["npm", "start"]\n\n';

  // VM configuration
  toml += '[vm]\n';
  toml += `  memory = "${memory}"\n`;
  toml += `  cpu_kind = "shared"\n`;
  toml += `  cpus = 1\n\n`;

  // Scaling configuration
  toml += '[scaling]\n';
  toml += `  min_machines_running = ${instances.min}\n`;
  toml += `  max_machines_running = ${instances.max}\n\n`;

  // Environment variables
  if (Object.keys(env).length > 0) {
    toml += '[env]\n';
    for (const [key, value] of Object.entries(env)) {
      // Handle different value types
      if (typeof value === 'string') {
        toml += `  ${key} = "${value}"\n`;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        toml += `  ${key} = ${value}\n`;
      } else {
        toml += `  ${key} = "${String(value)}"\n`;
      }
    }
    toml += '\n';
  }

  // Volumes configuration
  if (volumes.length > 0) {
    for (const volume of volumes) {
      toml += '[[mounts]]\n';
      toml += `  source = "${volume.name}"\n`;
      toml += `  destination = "${volume.mount}"\n\n`;
    }
  }

  return toml.trim();
}

/**
 * Parse existing fly.toml content
 */
export function parseFlyToml(content) {
  // Simple TOML parser for basic fly.toml structure
  const config = {
    app: null,
    region: 'ord',
    memory: '512mb',
    instances: { min: 1, max: 3 },
    env: {},
    volumes: [],
  };

  const lines = content.split('\n');
  let currentSection = null;
  let currentMount = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Section headers
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      if (currentSection === '[[mounts]]') {
        currentMount = {};
      }
      continue;
    }

    // Key-value pairs
    const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    const cleanValue = value.replace(/^["']|["']$/g, '');

    // Parse based on current section
    if (!currentSection || currentSection === 'root') {
      if (key === 'app') {
        config.app = cleanValue;
      } else if (key === 'primary_region') {
        config.region = cleanValue;
      }
    } else if (currentSection === 'vm') {
      if (key === 'memory') {
        config.memory = cleanValue;
      }
    } else if (currentSection === 'scaling') {
      if (key === 'min_machines_running') {
        config.instances.min = parseInt(cleanValue, 10);
      } else if (key === 'max_machines_running') {
        config.instances.max = parseInt(cleanValue, 10);
      }
    } else if (currentSection === 'env') {
      config.env[key] = cleanValue;
    } else if (currentSection === '[[mounts]]' && currentMount) {
      if (key === 'source') {
        currentMount.name = cleanValue;
      } else if (key === 'destination') {
        currentMount.mount = cleanValue;
        config.volumes.push({ ...currentMount });
        currentMount = null;
      }
    }
  }

  return config;
}

/**
 * Merge fly.toml configurations
 */
export function mergeFlyTomlConfig(existing, updates) {
  return {
    ...existing,
    ...updates,
    env: {
      ...existing?.env,
      ...updates?.env,
    },
    instances: {
      ...existing?.instances,
      ...updates?.instances,
    },
    volumes: [
      ...(existing?.volumes || []),
      ...(updates?.volumes || []),
    ],
  };
}

/**
 * Validate fly.toml configuration
 */
export function validateFlyTomlConfig(config) {
  const errors = [];

  if (!config.app) {
    errors.push('App name is required');
  }

  if (config.instances) {
    if (config.instances.min < 0) {
      errors.push('Minimum instances must be >= 0');
    }
    if (config.instances.max < 1) {
      errors.push('Maximum instances must be >= 1');
    }
    if (config.instances.min > config.instances.max) {
      errors.push('Minimum instances cannot exceed maximum instances');
    }
  }

  if (config.memory && !config.memory.match(/^\d+(mb|gb)$/i)) {
    errors.push('Memory must be in format like "512mb" or "1gb"');
  }

  if (config.volumes) {
    for (const volume of config.volumes) {
      if (!volume.name) {
        errors.push('Volume name is required');
      }
      if (!volume.mount) {
        errors.push('Volume mount path is required');
      }
      if (volume.mount && !volume.mount.startsWith('/')) {
        errors.push('Volume mount path must be absolute');
      }
    }
  }

  return errors;
}
