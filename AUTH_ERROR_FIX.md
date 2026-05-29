# 🚨 Fix Claude Connector Auth Error

## Error Message:
```
Couldn't register with KEXP V2's sign-in service. You can try again, or add an OAuth Client ID in the connector settings.
```

## ✅ Step-by-Step Fix

### 1. Delete Existing Connector
- Go to Claude → Settings → Connectors
- **Delete** any existing KEXP connector completely
- This clears any cached auth assumptions

### 2. Create New Connector with EXACT Settings
- Click **"Add Connector"** → **"Custom"**
- **Name**: `KEXP Radio`
- **Base URL**: `https://kexp-mcp-server-production-990e.up.railway.app`
- **Authentication Method**: **None** ⚠️ (CRITICAL!)

### 3. Upload the Simple Schema
- Use file: `claude-connector-simple.yaml`
- This schema explicitly states `security: []` for every endpoint

### 4. Test Before Saving
- Click **"Test Connection"** 
- Should show: ✅ Connection successful
- If it fails, check the URL and ensure Authentication = None

### 5. Alternative: Try Direct URL Test
Test this URL in your browser first:
```
https://kexp-mcp-server-production-990e.up.railway.app/current
```

Should return JSON like:
```json
{
  "success": true,
  "data": {
    "song": "Song Title",
    "artist": "Artist Name"
  }
}
```

## 🔧 If Still Getting Auth Error

### Option A: Use Local Server
```bash
npm run http
```
Then use: `http://localhost:3000` as Base URL

### Option B: Try Different Claude Interface
- Sometimes the connector interface has cached auth requirements
- Try logging out and back into Claude
- Clear browser cache/cookies for claude.ai

### Option C: Minimal Test Setup
Create connector with ONLY:
- **Base URL**: `https://kexp-mcp-server-production-990e.up.railway.app`
- **Authentication**: **None**
- **Schema**: Just upload `claude-connector-simple.yaml`

## 🎯 Key Points
1. **NO OAuth** - KEXP API is public
2. **NO API Keys** - No authentication needed
3. **NO Bearer Tokens** - Leave all auth fields empty
4. The server works fine - this is a Claude UI issue

## 📞 If Nothing Works
The API is definitely working. Test it yourself:
```bash
curl "https://kexp-mcp-server-production-990e.up.railway.app/current"
```

The issue is Claude incorrectly assuming authentication is required. The `claude-connector-simple.yaml` file should fix this by being very explicit about no auth.