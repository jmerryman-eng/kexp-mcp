# KEXP MCP Server

A Model Context Protocol (MCP) server that provides access to KEXP's radio API, allowing you to query current and recent plays, hosts, programs, and shows.

## Features

- **Current Play**: Get the currently playing track on KEXP
- **Recent Plays**: Get recently played tracks with customizable limits
- **Search**: Search for tracks by artist, song, or album
- **Hosts**: Get information about KEXP radio hosts
- **Programs**: Get information about KEXP radio programs
- **Shows**: Get information about current and past shows
- **Detailed Lookups**: Get detailed information about specific plays, hosts, shows, or programs by ID

## Installation

```bash
npm install
npm run build
```

## Usage

### With Claude Desktop

Add this server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "kexp": {
      "command": "node",
      "args": ["/path/to/kexp-mcp-server/build/index.js"]
    }
  }
}
```

### Available Tools

1. **get_current_play** - Get the currently playing track
2. **get_recent_plays** - Get recently played tracks (limit: 1-100)
3. **search_plays** - Search for tracks by query (limit: 1-50)
4. **get_hosts** - Get KEXP hosts (limit: 1-100, active_only option)
5. **get_programs** - Get KEXP programs (limit: 1-100, active_only option)
6. **get_current_show** - Get currently airing show information
7. **get_play_by_id** - Get detailed play information by ID
8. **get_host_by_id** - Get detailed host information by ID
9. **get_show_by_id** - Get detailed show information by ID
10. **get_program_by_id** - Get detailed program information by ID

## API Reference

This server interfaces with the KEXP API v2 at `https://api.kexp.org/v2/`. All data comes directly from KEXP's public API.

### Example Responses

#### Current Play
```
Currently playing on KEXP:

**Makthaverskan** - "Glass and Bones"
Album: Glass and Bones
Aired: 5/27/2026, 4:32:23 PM
Rotation: Heavy

Comment: From KEXP's album review...
```

#### Recent Plays
```
Recent plays on KEXP (10 tracks):

1. **Artist Name** - "Song Title" (Album Name)
   Aired: 5/27/2026, 4:30:00 PM

2. **Another Artist** - "Another Song"
   Aired: 5/27/2026, 4:25:15 PM
...
```

## HTTP API (Testing & Connectors)

This server also provides an HTTP API for easy testing and connector integration:

```bash
# Start HTTP server
npm run http

# Test endpoints
curl http://localhost:3000/current
curl http://localhost:3000/recent?limit=5
curl "http://localhost:3000/search?q=Radiohead&limit=3"
```

**Available HTTP Endpoints:**
- `GET /` - API documentation
- `GET /current` - Currently playing track
- `GET /recent?limit=10` - Recent plays
- `GET /search?q=artist&limit=10` - Search tracks
- `GET /hosts?active=true&limit=20` - KEXP hosts
- `GET /programs?active=true&limit=20` - Radio programs
- `GET /current-show` - Current show info
- `GET /play/:id` - Play details by ID
- `GET /host/:id` - Host details by ID
- `GET /show/:id` - Show details by ID
- `GET /program/:id` - Program details by ID
- `GET /health` - Health check

## Hosting & Deployment

### 🚀 Railway Deployment

Deploy to Railway (like the example server we compared to):

1. **Fork this repository**
2. **Connect to Railway:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and deploy
   railway login
   railway init
   railway up
   ```

3. **Configure Railway:**
   ```yaml
   # railway.toml
   [build]
   builder = "nixpacks"
   
   [deploy]
   startCommand = "npm run http"
   ```

4. **Environment Variables:**
   ```bash
   PORT=3000  # Railway sets this automatically
   NODE_ENV=production
   ```

5. **Your server will be available at:**
   `https://your-project-production.up.railway.app`

### 🌐 Other Hosting Platforms

#### Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add to vercel.json:
{
  "version": 2,
  "builds": [
    {
      "src": "build/http-server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/build/http-server.js"
    }
  ]
}
```

#### Render
```yaml
# render.yaml
services:
  - type: web
    name: kexp-mcp-server
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run http
    envVars:
      - key: NODE_ENV
        value: production
```

#### DigitalOcean App Platform
```yaml
# .do/app.yaml
name: kexp-mcp-server
services:
- name: api
  source_dir: /
  github:
    repo: your-username/kexp-mcp-server
    branch: main
  run_command: npm run http
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  routes:
  - path: /
```

#### Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "http"]
```

```bash
# Build and run
docker build -t kexp-mcp-server .
docker run -p 3000:3000 kexp-mcp-server
```

### 🔧 Production Configuration

#### Environment Variables
```bash
# Required
PORT=3000                    # Server port
NODE_ENV=production         # Environment

# Optional
CORS_ORIGIN=*               # CORS origins
API_TIMEOUT=30000           # Request timeout (ms)
RATE_LIMIT_REQUESTS=100     # Rate limit per minute
RATE_LIMIT_WINDOW=60000     # Rate limit window (ms)
```

#### PM2 (Process Manager)
```bash
# Install PM2
npm install -g pm2

# Create ecosystem.config.js
module.exports = {
  apps: [{
    name: 'kexp-mcp-server',
    script: 'build/http-server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

#### Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/kexp-mcp
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 📊 Production Monitoring

#### Health Checks
```bash
# Basic health check
curl https://your-domain.com/health

# Detailed status
curl https://your-domain.com/ | jq '.endpoints'
```

#### Logging
```javascript
// Add to your deployment
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### 🔗 Claude Desktop Configuration (Remote)

For hosted servers, update your Claude Desktop config:

```json
{
  "mcpServers": {
    "kexp-remote": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "https://your-project-production.up.railway.app/mcp"
      ]
    }
  }
}
```

### ✅ Production Server Available

**Live Railway Deployment**: `https://kexp-mcp-server-production-990e.up.railway.app`

Test endpoints:
- Current play: https://kexp-mcp-server-production-990e.up.railway.app/current
- Health check: https://kexp-mcp-server-production-990e.up.railway.app/health
- API docs: https://kexp-mcp-server-production-990e.up.railway.app/

### 🛡️ Security Considerations

- **API Rate Limiting**: Implement rate limiting for production
- **CORS Configuration**: Set appropriate CORS origins
- **HTTPS**: Use HTTPS in production (automatic on Railway/Vercel)
- **Environment Variables**: Never commit sensitive data
- **Monitoring**: Set up error tracking and performance monitoring

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Development with auto-rebuild
npm run dev

# Start HTTP server (testing)
npm run http

# Start MCP server (Claude Desktop)
npm start
```

## License

MIT License