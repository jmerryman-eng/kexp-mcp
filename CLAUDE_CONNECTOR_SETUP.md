# Claude Connector Setup for KEXP API

## 🚨 Authentication Issue Fix

If you're getting this error:
```
Couldn't register with KEXP V2's sign-in service. You can try again, or add an OAuth Client ID in the connector settings.
```

This happens because Claude is trying to authenticate when the KEXP API is actually **public and requires no authentication**.

## ✅ Correct Setup

### Option 1: Use Our HTTP API (Recommended)

1. **Start the local HTTP server:**
   ```bash
   npm run http
   ```
   Server runs at: `http://localhost:3000`

2. **In Claude, create a Custom Connector with:**
   - **Base URL**: `http://localhost:3000`
   - **Authentication**: **None** (very important!)
   - **API Schema**: Upload `claude-connector.yaml`

### Option 2: Direct KEXP API Integration

If you want to connect directly to KEXP's API:
- **Base URL**: `https://api.kexp.org/v2`
- **Authentication**: **None**
- **Important**: KEXP's API has CORS restrictions, so local proxy is recommended

## 🔧 Available Endpoints

Once connected, you can ask Claude to:

- **"What's playing on KEXP right now?"** → `/current`
- **"Show me the last 5 songs played"** → `/recent?limit=5`
- **"Search for Radiohead tracks"** → `/search?q=Radiohead`
- **"Who are the active KEXP hosts?"** → `/hosts?active=true`
- **"What show is on now?"** → `/current-show`

## 🧪 Test Your Setup

Test these URLs directly in your browser first:
- http://localhost:3000/current
- http://localhost:3000/recent?limit=3
- http://localhost:3000/health

If these work, your connector should work too!

## 🛠️ Troubleshooting

### "Connection refused" error:
- Make sure the HTTP server is running: `npm run http`
- Check the server is on port 3000: `curl http://localhost:3000/health`

### "Authentication required" error:
- ⚠️ **Set Authentication to "None"** in connector settings
- Don't add any API keys or OAuth settings

### "Invalid schema" error:
- Use the `claude-connector.yaml` file provided
- Make sure it's properly formatted OpenAPI 3.0

## 📝 Example Connector Configuration

```yaml
openapi: 3.0.0
info:
  title: KEXP Radio API
  version: 1.0.0
servers:
  - url: http://localhost:3000
security: []  # ← This means NO authentication required
```

## 🔄 Alternative: Use Deployed Version

### ✅ Production Railway Server (Ready Now!)
- **Base URL**: `https://kexp-mcp-server-production-990e.up.railway.app`
- **Authentication**: **None**
- **API Schema**: Upload `claude-connector-production.yaml`
- **Status**: ✅ Live and tested!

Test the production API:
- https://kexp-mcp-server-production-990e.up.railway.app/current
- https://kexp-mcp-server-production-990e.up.railway.app/health

### Other Deployments
If you've deployed to other platforms, use that URL instead:
- **Base URL**: `https://your-app.vercel.app` (or other)
- **Authentication**: **None**
- Rest of setup is the same

The key is always: **No authentication required!** 🎵