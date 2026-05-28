# 🚀 KEXP MCP Server Deployment Guide

Complete deployment instructions for hosting your KEXP MCP server like the example at `kexpmcpserver-production.up.railway.app`.

## Quick Deploy Options

### 🌟 Railway (Recommended)
**One-click deploy:**
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/your-template)

**Manual deploy:**
```bash
railway login
railway init
railway up
```

### 🔥 Other Platforms

| Platform | Deploy Command | Config File |
|----------|---------------|-------------|
| **Vercel** | `vercel` | `vercel.json` |
| **Render** | Connect GitHub | `render.yaml` |
| **DigitalOcean** | `doctl apps create --spec .do/app.yaml` | `.do/app.yaml` |
| **Docker** | `docker build -t kexp . && docker run -p 3000:3000 kexp` | `Dockerfile` |

## Configuration Files Included

✅ `railway.toml` - Railway configuration  
✅ `vercel.json` - Vercel deployment  
✅ `render.yaml` - Render.com setup  
✅ `.do/app.yaml` - DigitalOcean App Platform  
✅ `Dockerfile` - Docker containerization  
✅ `ecosystem.config.js` - PM2 process manager  

## Environment Variables

### Required
```bash
PORT=3000                    # Server port (auto-set by most platforms)
NODE_ENV=production         # Environment mode
```

### Optional
```bash
CORS_ORIGIN=*               # CORS allowed origins
API_TIMEOUT=30000           # KEXP API timeout (ms)
RATE_LIMIT_REQUESTS=100     # Rate limit per minute
RATE_LIMIT_WINDOW=60000     # Rate limit window (ms)
```

## Platform-Specific Instructions

### Railway Deployment
1. **Fork this repository**
2. **Connect to Railway:**
   - Visit [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Connect your GitHub repository
3. **Configure:**
   - Environment: `NODE_ENV=production`
   - Port: Auto-detected from `package.json`
4. **Deploy:**
   - Railway automatically builds and deploys
   - Your URL: `https://your-project-production.up.railway.app`

### Vercel Deployment
```bash
# Install CLI
npm i -g vercel

# Deploy
vercel

# Set environment
vercel env add NODE_ENV production
```

### Render Deployment
1. **Connect Repository:**
   - Visit [render.com](https://render.com)
   - Connect GitHub repository
2. **Configure:**
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run http`
   - Environment: `NODE_ENV=production`

### Docker Deployment
```bash
# Build image
docker build -t kexp-mcp-server .

# Run container
docker run -d \
  --name kexp-server \
  -p 3000:3000 \
  -e NODE_ENV=production \
  kexp-mcp-server

# Check health
curl http://localhost:3000/health
```

## Production Checklist

### 🔧 Performance
- [ ] Enable clustering (PM2 or platform auto-scaling)
- [ ] Set up health checks (`/health` endpoint)
- [ ] Configure CORS for your domain
- [ ] Enable request logging
- [ ] Set appropriate timeouts

### 🛡️ Security
- [ ] Use HTTPS (auto on Railway/Vercel)
- [ ] Set CORS origins (not `*` for production)
- [ ] Implement rate limiting
- [ ] Monitor for errors
- [ ] Keep dependencies updated

### 📊 Monitoring
- [ ] Set up health check monitoring
- [ ] Configure error tracking
- [ ] Monitor API response times
- [ ] Set up alerts for downtime

## Testing Your Deployment

### Basic Functionality
```bash
# Replace with your actual URL
export SERVER_URL="https://your-project-production.up.railway.app"

# Health check
curl $SERVER_URL/health

# Current play
curl $SERVER_URL/current

# API documentation
curl $SERVER_URL/ | jq
```

### Load Testing
```bash
# Install artillery
npm i -g artillery

# Create test.yml
echo 'config:
  target: "https://your-server.com"
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "API Load Test"
    flow:
      - get:
          url: "/current"
      - get:
          url: "/recent?limit=5"
      - get:
          url: "/health"' > test.yml

# Run load test
artillery run test.yml
```

## Claude Desktop Configuration

### Local Server
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

### Remote Server
```json
{
  "mcpServers": {
    "kexp-remote": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-fetch",
        "https://your-project-production.up.railway.app"
      ]
    }
  }
}
```

## Troubleshooting

### Common Issues

**Server won't start:**
- Check `NODE_ENV` is set to `production`
- Verify `PORT` environment variable
- Check build completed successfully

**API timeouts:**
- Increase `API_TIMEOUT` environment variable
- Check KEXP API status at `api.kexp.org`

**CORS errors:**
- Set `CORS_ORIGIN` to your domain
- For development, use `CORS_ORIGIN=*`

**Memory issues:**
- Enable clustering with PM2
- Monitor memory usage
- Set `max_memory_restart` in PM2 config

### Debug Commands
```bash
# Check server logs (Railway)
railway logs

# Check server status (Docker)
docker logs kexp-server

# Test local build
npm run build && npm run http
curl http://localhost:3000/health
```

## Support

- **KEXP API Issues**: Check [api.kexp.org](https://api.kexp.org/v2/)
- **Platform Issues**: Refer to platform documentation
- **MCP Protocol**: See [MCP Documentation](https://modelcontextprotocol.io)

## Example URLs

Once deployed, your server will provide:

- **API Docs**: `https://your-domain.com/`
- **Current Play**: `https://your-domain.com/current`
- **Health Check**: `https://your-domain.com/health`
- **Search**: `https://your-domain.com/search?q=Radiohead`

Your server will be ready for Claude connector integration! 🎵