#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { KexpClient } from './kexp-client.js';
import { createKexpMcpServer } from './mcp-server.js';

const app = express();
const port = process.env.PORT || 3000;
const kexpClient = new KexpClient();

app.use(cors());
app.use(express.json());

// MCP Streamable HTTP transport endpoint.
// Stateless pattern: a fresh Server + transport per request so concurrent
// connectors never share connection state. The full toolset is defined once in
// ./mcp-server.ts (the `tools` array) and shared with the stdio server
// (index.ts), so both transports always expose the same tools.
app.post('/mcp', async (req, res) => {
  try {
    const mcpServer = createKexpMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ 
        jsonrpc: '2.0', 
        error: { code: -32603, message: 'Internal server error' }, 
        id: null 
      });
    }
  }
});

// Method not allowed for GET and DELETE on /mcp
const notAllowed = (_req: any, res: any) =>
  res.status(405).json({ 
    jsonrpc: '2.0', 
    error: { code: -32000, message: 'Method not allowed.' }, 
    id: null 
  });

app.get('/mcp', notAllowed);
app.delete('/mcp', notAllowed);

// Root endpoint with API documentation
app.get('/', (req, res) => {
  res.json({
    name: 'KEXP API Connector',
    version: '1.0.0',
    description: 'HTTP API wrapper for KEXP radio data',
    endpoints: {
      'GET /current': 'Get currently playing track',
      'GET /recent?limit=10': 'Get recent plays (limit: 1-100)',
      'GET /search?q=artist&limit=10': 'Search plays by query (limit: 1-50)',
      'GET /hosts?limit=20&active=true': 'Get hosts (limit: 1-100)',
      'GET /programs?limit=20&active=true': 'Get programs (limit: 1-100)',
      'GET /current-show': 'Get current show information',
      'GET /play/:id': 'Get play details by ID',
      'GET /host/:id': 'Get host details by ID',
      'GET /show/:id': 'Get show details by ID',
      'GET /program/:id': 'Get program details by ID',
      'POST /mcp': 'MCP Streamable HTTP endpoint for Claude connectors'
    },
    examples: {
      current: '/current',
      recent: '/recent?limit=5',
      search: '/search?q=Radiohead&limit=10',
      hosts: '/hosts?active=true',
      play: '/play/3660291'
    }
  });
});

// Get current play
app.get('/current', async (req, res) => {
  try {
    const currentPlay = await kexpClient.getCurrentPlay();
    if (!currentPlay) {
      return res.status(404).json({ error: 'No current play data available' });
    }
    res.json({
      success: true,
      data: {
        song: currentPlay.song,
        artist: currentPlay.artist,
        album: currentPlay.album,
        airdate: currentPlay.airdate,
        image_uri: currentPlay.image_uri,
        thumbnail_uri: currentPlay.thumbnail_uri,
        comment: currentPlay.comment,
        rotation_status: currentPlay.rotation_status,
        is_local: currentPlay.is_local,
        is_request: currentPlay.is_request,
        play_type: currentPlay.play_type,
        id: currentPlay.id
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get recent plays
app.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const recentPlays = await kexpClient.getRecentPlays(limit);
    
    res.json({
      success: true,
      data: recentPlays.map(play => ({
        id: play.id,
        song: play.song,
        artist: play.artist,
        album: play.album,
        airdate: play.airdate,
        image_uri: play.image_uri,
        thumbnail_uri: play.thumbnail_uri,
        rotation_status: play.rotation_status,
        is_local: play.is_local,
        is_request: play.is_request,
        play_type: play.play_type
      })),
      count: recentPlays.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Search plays
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter "q" is required' 
      });
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const searchResults = await kexpClient.searchPlays(query, limit);
    
    res.json({
      success: true,
      query,
      data: searchResults.map(play => ({
        id: play.id,
        song: play.song,
        artist: play.artist,
        album: play.album,
        airdate: play.airdate,
        image_uri: play.image_uri,
        thumbnail_uri: play.thumbnail_uri,
        rotation_status: play.rotation_status,
        is_local: play.is_local,
        is_request: play.is_request,
        play_type: play.play_type
      })),
      count: searchResults.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get hosts
app.get('/hosts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const activeOnly = req.query.active !== 'false';
    const hostsResponse = await kexpClient.getHosts({ limit });
    
    let hosts = hostsResponse.results;
    if (activeOnly) {
      hosts = hosts.filter(host => host.is_active);
    }
    
    res.json({
      success: true,
      data: hosts.map(host => ({
        id: host.id,
        name: host.name,
        image_uri: host.image_uri,
        thumbnail_uri: host.thumbnail_uri,
        is_active: host.is_active,
        location: host.location
      })),
      count: hosts.length,
      total: hostsResponse.count
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get programs
app.get('/programs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const activeOnly = req.query.active !== 'false';
    const programsResponse = await kexpClient.getPrograms({ limit });
    
    let programs = programsResponse.results;
    if (activeOnly) {
      programs = programs.filter(program => program.is_active);
    }
    
    res.json({
      success: true,
      data: programs.map(program => ({
        id: program.id,
        name: program.name,
        host_names: program.host_names,
        tagline: program.tagline,
        description: program.description,
        tags: program.tags,
        image_uri: program.image_uri,
        thumbnail_uri: program.thumbnail_uri,
        is_active: program.is_active,
        location: program.location
      })),
      count: programs.length,
      total: programsResponse.count
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get current show
app.get('/current-show', async (req, res) => {
  try {
    const showsResponse = await kexpClient.getShows({ 
      limit: 1, 
      ordering: '-start_time' 
    });
    
    if (showsResponse.results.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No current show information available' 
      });
    }

    const show = showsResponse.results[0];
    res.json({
      success: true,
      data: {
        id: show.id,
        program_name: show.program_name,
        host_names: show.host_names,
        start_time: show.start_time,
        tagline: show.tagline,
        program_tags: show.program_tags,
        image_uri: show.image_uri,
        program_image_uri: show.program_image_uri,
        location_name: show.location_name
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get play by ID
app.get('/play/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid play ID' 
      });
    }
    
    const play = await kexpClient.getPlayById(id);
    if (!play) {
      return res.status(404).json({ 
        success: false, 
        error: `Play with ID ${id} not found` 
      });
    }

    res.json({
      success: true,
      data: play
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get host by ID
app.get('/host/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid host ID' 
      });
    }
    
    const host = await kexpClient.getHostById(id);
    if (!host) {
      return res.status(404).json({ 
        success: false, 
        error: `Host with ID ${id} not found` 
      });
    }

    res.json({
      success: true,
      data: host
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get show by ID
app.get('/show/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid show ID' 
      });
    }
    
    const show = await kexpClient.getShowById(id);
    if (!show) {
      return res.status(404).json({ 
        success: false, 
        error: `Show with ID ${id} not found` 
      });
    }

    res.json({
      success: true,
      data: show
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get program by ID
app.get('/program/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid program ID' 
      });
    }
    
    const program = await kexpClient.getProgramById(id);
    if (!program) {
      return res.status(404).json({ 
        success: false, 
        error: `Program with ID ${id} not found` 
      });
    }

    res.json({
      success: true,
      data: program
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

// Error handling middleware
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /',
      'GET /current',
      'GET /recent',
      'GET /search',
      'GET /hosts',
      'GET /programs',
      'GET /current-show',
      'GET /play/:id',
      'GET /host/:id',
      'GET /show/:id',
      'GET /program/:id',
      'GET /health'
    ]
  });
});

app.listen(port, () => {
  console.log(`🎵 KEXP API Connector running on http://localhost:${port}`);
  console.log(`📖 API documentation available at http://localhost:${port}`);
  console.log(`🎧 Try: http://localhost:${port}/current`);
});