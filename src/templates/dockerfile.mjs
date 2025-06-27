/**
 * Generate Dockerfile content for Nuxt applications
 */
export function generateDockerfile(config = {}) {
  const nodeVersion = config.nodeVersion || '20';
  const packageManager = config.packageManager || 'npm';
  
  return `# Dockerfile for Nuxt application
FROM node:${nodeVersion}-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
${packageManager === 'pnpm' ? 'COPY pnpm-lock.yaml ./' : ''}
${packageManager === 'yarn' ? 'COPY yarn.lock ./' : ''}

# Install dependencies
${getInstallCommand(packageManager)}

# Copy application files
COPY . .

# Build the application
${getBuildCommand(packageManager)}

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD [${getStartCommand(packageManager)}]
`;
}

/**
 * Get install command for package manager
 */
function getInstallCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'RUN npm install -g pnpm && pnpm install --frozen-lockfile';
    case 'yarn':
      return 'RUN yarn install --frozen-lockfile';
    case 'npm':
    default:
      return 'RUN npm ci';
  }
}

/**
 * Get build command for package manager
 */
function getBuildCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return 'RUN pnpm build';
    case 'yarn':
      return 'RUN yarn build';
    case 'npm':
    default:
      return 'RUN npm run build';
  }
}

/**
 * Get start command for package manager
 */
function getStartCommand(packageManager) {
  switch (packageManager) {
    case 'pnpm':
      return '"pnpm", "start"';
    case 'yarn':
      return '"yarn", "start"';
    case 'npm':
    default:
      return '"npm", "start"';
  }
}

/**
 * Generate .dockerignore content
 */
export function generateDockerignore() {
  return `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Nuxt.js build / generate output
.nuxt
dist/

# Nuxt.js cache
.cache/

# Vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# IDE / Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Git
.git/
.gitignore

# Nuxfly
.nuxfly/

# Other common files
*.log
*.tmp
*.temp
README.md
LICENSE
*.md
!package.json
!package-lock.json
!yarn.lock
!pnpm-lock.yaml
`;
}