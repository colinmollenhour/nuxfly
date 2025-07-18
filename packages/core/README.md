# @nuxfly/core

A Nuxt module that provides seamless integration with Fly.io infrastructure, including SQLite databases and S3 storage.

> [!WARNING]
> This project is in early development and may not be fully functional yet.

## Features

- 🗄️ **SQLite Database** - libSQL integration with automatic connection management
- 📦 **S3 Storage** - Public and private file storage with pre-signed URLs
- 🔧 **Fly.io Integration** - Access to Fly.io platform utilities and proxying
- 🎯 **TypeScript Support** - Full type safety with auto-completion
- ⚡ **Server-side Ready** - Optimized for Nuxt server-side rendering
- 🔄 **Auto Configuration** - Automatic setup based on environment variables

## Installation

```bash
npm install @nuxfly/core
```

## Setup

Add the module to your `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: ['@nuxfly/core'],
  nuxfly: {
    // Optional configuration
    database: {
      url: process.env.DATABASE_URL
    },
    storage: {
      publicBucket: process.env.PUBLIC_BUCKET_NAME,
      privateBucket: process.env.PRIVATE_BUCKET_NAME,
      region: process.env.AWS_REGION,
      endpoint: process.env.S3_ENDPOINT
    }
  }
})
```

## Composables

### `useSqliteDatabase()`

Access your libSQL database with automatic connection management.

```typescript
const { db, execute, query } = useSqliteDatabase()

// Execute queries
await execute('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@example.com'])

// Fetch data
const users = await query('SELECT * FROM users WHERE active = ?', [true])
```

### `usePublicStorage()`

Manage public file storage with S3-compatible API.

```typescript
const { uploadFile, getFileUrl, deleteFile, listFiles } = usePublicStorage()

// Upload a file
const result = await uploadFile(file, 'uploads/avatar.jpg')

// Get public URL
const url = await getFileUrl('uploads/avatar.jpg')

// List files
const files = await listFiles('uploads/')
```

### `usePrivateStorage()`

Handle private file storage with pre-signed URLs for secure access.

```typescript
const { uploadFile, getSignedUrl, deleteFile, listFiles } = usePrivateStorage()

// Upload private file
await uploadFile(file, 'documents/private.pdf')

// Get signed URL (expires in 1 hour by default)
const signedUrl = await getSignedUrl('documents/private.pdf', { expiresIn: 3600 })
```

### `useFlyProxy()`

Access Fly.io platform utilities and command proxying.

```typescript
const { proxyCommand, getAppInfo, getRegions } = useFlyProxy()

// Proxy flyctl commands
const result = await proxyCommand(['apps', 'list'])

// Get app information
const appInfo = await getAppInfo('my-app')
```

## Environment Variables

The module automatically configures itself using these environment variables:

```bash
# Database
DATABASE_URL=libsql://your-database-url
DATABASE_AUTH_TOKEN=your-auth-token

# Storage
PUBLIC_BUCKET_NAME=your-public-bucket
PRIVATE_BUCKET_NAME=your-private-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_ENDPOINT=https://your-s3-endpoint

# Fly.io
FLY_API_TOKEN=your-fly-token
FLY_APP_NAME=your-app-name
```

## TypeScript Support

The module provides full TypeScript support with auto-completion:

```typescript
// Auto-completion for all composables
const { db } = useSqliteDatabase()
const { uploadFile } = usePublicStorage()

// Type-safe query results
interface User {
  id: number
  name: string
  email: string
}

const users = await query<User>('SELECT * FROM users')
```

## Examples

### Todo App with Database

```vue
<script setup>
const { db, query, execute } = useSqliteDatabase()

const todos = ref([])

// Fetch todos
const fetchTodos = async () => {
  todos.value = await query('SELECT * FROM todos ORDER BY created_at DESC')
}

// Add todo
const addTodo = async (text: string) => {
  await execute('INSERT INTO todos (text, completed) VALUES (?, ?)', [text, false])
  await fetchTodos()
}

onMounted(fetchTodos)
</script>
```

### File Upload with Storage

```vue
<script setup>
const { uploadFile, getFileUrl } = usePublicStorage()

const handleFileUpload = async (file: File) => {
  const key = `uploads/${Date.now()}-${file.name}`
  await uploadFile(file, key)
  const url = await getFileUrl(key)
  console.log('File uploaded:', url)
}
</script>
```

## Documentation

For detailed documentation and examples, visit: [nuxfly documentation](https://nuxfly.dev)

## License

MIT