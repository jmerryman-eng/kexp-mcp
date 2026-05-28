# KEXP API Connector - Test Endpoints

The HTTP API is running on `http://localhost:3000` and ready for testing with Claude connectors.

## Quick Test URLs

### 1. Current Play
```
GET http://localhost:3000/current
```
Returns the track currently playing on KEXP.

### 2. Recent Plays
```
GET http://localhost:3000/recent?limit=5
```
Get the 5 most recently played tracks.

### 3. Search Tracks
```
GET http://localhost:3000/search?q=Radiohead&limit=10
```
Search for tracks containing "Radiohead" in artist, song, or album.

### 4. Active Hosts
```
GET http://localhost:3000/hosts?active=true&limit=10
```
Get active KEXP radio hosts.

### 5. Active Programs
```
GET http://localhost:3000/programs?active=true&limit=10
```
Get active KEXP radio programs.

### 6. Current Show
```
GET http://localhost:3000/current-show
```
Get information about the currently airing show.

### 7. Specific Play Details
```
GET http://localhost:3000/play/3660291
```
Get detailed information about a specific play by ID.

### 8. Specific Host Details
```
GET http://localhost:3000/host/1
```
Get detailed information about a specific host by ID.

## API Documentation
Visit `http://localhost:3000/` for complete API documentation with all available endpoints.

## Response Format
All responses follow this format:
```json
{
  "success": true,
  "data": { ... },
  "count": 10  // for array responses
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error message"
}
```

## For Claude Connectors
Use the `connector-config.yaml` file to configure this API as a Claude connector. The configuration includes:
- All 10 endpoints with proper schemas
- Parameter validation and descriptions
- Response type definitions
- Health check endpoint

## Health Check
```
GET http://localhost:3000/health
```
Returns server status for monitoring.