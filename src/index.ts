#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { KexpClient } from './kexp-client.js';

const server = new Server({
  name: 'kexp-mcp-server',
  version: '1.0.0',
});

const kexpClient = new KexpClient();

const tools: Tool[] = [
  {
    name: 'get_current_play',
    description: 'Get the currently playing track on KEXP',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_recent_plays',
    description: 'Get recently played tracks on KEXP',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent plays to fetch (default: 10, max: 100)',
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: 'search_plays',
    description: 'Search for played tracks by artist, song, or album',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for artist, song, or album',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default: 10, max: 50)',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_hosts',
    description: 'Get KEXP radio hosts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of hosts to fetch (default: 20)',
          minimum: 1,
          maximum: 100,
        },
        active_only: {
          type: 'boolean',
          description: 'Only return active hosts (default: true)',
        },
      },
    },
  },
  {
    name: 'get_programs',
    description: 'Get KEXP radio programs',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of programs to fetch (default: 20)',
          minimum: 1,
          maximum: 100,
        },
        active_only: {
          type: 'boolean',
          description: 'Only return active programs (default: true)',
        },
      },
    },
  },
  {
    name: 'get_current_show',
    description: 'Get information about the currently airing show on KEXP',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_play_by_id',
    description: 'Get detailed information about a specific play by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The play ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_host_by_id',
    description: 'Get detailed information about a specific host by their ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The host ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_show_by_id',
    description: 'Get detailed information about a specific show by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The show ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_program_by_id',
    description: 'Get detailed information about a specific program by its ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The program ID',
        },
      },
      required: ['id'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_current_play': {
        const currentPlay = await kexpClient.getCurrentPlay();
        if (!currentPlay) {
          return {
            content: [{ type: 'text', text: 'No current play information available' }],
          };
        }
        
        const result = {
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
        };
        
        return {
          content: [
            {
              type: 'text',
              text: `Currently playing on KEXP:\n\n**${result.artist}** - "${result.song}"\n${result.album ? `Album: ${result.album}\n` : ''}Aired: ${new Date(result.airdate).toLocaleString()}\n${result.rotation_status ? `Rotation: ${result.rotation_status}\n` : ''}${result.comment ? `\nComment: ${result.comment}` : ''}`,
            },
          ],
        };
      }

      case 'get_recent_plays': {
        const limit = Math.min((args?.limit as number) || 10, 100);
        const recentPlays = await kexpClient.getRecentPlays(limit);
        
        if (recentPlays.length === 0) {
          return {
            content: [{ type: 'text', text: 'No recent plays found' }],
          };
        }

        const playsList = recentPlays.map((play, index) => 
          `${index + 1}. **${play.artist}** - "${play.song}"${play.album ? ` (${play.album})` : ''}\n   Aired: ${new Date(play.airdate).toLocaleString()}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Recent plays on KEXP (${recentPlays.length} tracks):\n\n${playsList}`,
            },
          ],
        };
      }

      case 'search_plays': {
        const query = args?.query as string;
        if (!query) {
          throw new Error('Query parameter is required');
        }
        
        const limit = Math.min((args?.limit as number) || 10, 50);
        const searchResults = await kexpClient.searchPlays(query, limit);
        
        if (searchResults.length === 0) {
          return {
            content: [{ type: 'text', text: `No plays found for query: "${query}"` }],
          };
        }

        const resultsList = searchResults.map((play, index) => 
          `${index + 1}. **${play.artist}** - "${play.song}"${play.album ? ` (${play.album})` : ''}\n   Aired: ${new Date(play.airdate).toLocaleString()}\n   ID: ${play.id}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Search results for "${query}" (${searchResults.length} tracks):\n\n${resultsList}`,
            },
          ],
        };
      }

      case 'get_hosts': {
        const limit = Math.min((args?.limit as number) || 20, 100);
        const activeOnly = (args?.active_only as boolean) !== false;
        const hostsResponse = await kexpClient.getHosts({ limit });
        
        let hosts = hostsResponse.results;
        if (activeOnly) {
          hosts = hosts.filter(host => host.is_active);
        }

        if (hosts.length === 0) {
          return {
            content: [{ type: 'text', text: 'No hosts found' }],
          };
        }

        const hostsList = hosts.map((host, index) => 
          `${index + 1}. **${host.name}** (ID: ${host.id})\n   Status: ${host.is_active ? 'Active' : 'Inactive'}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `KEXP Hosts (${hosts.length} hosts):\n\n${hostsList}`,
            },
          ],
        };
      }

      case 'get_programs': {
        const limit = Math.min((args?.limit as number) || 20, 100);
        const activeOnly = (args?.active_only as boolean) !== false;
        const programsResponse = await kexpClient.getPrograms({ limit });
        
        let programs = programsResponse.results;
        if (activeOnly) {
          programs = programs.filter(program => program.is_active);
        }

        if (programs.length === 0) {
          return {
            content: [{ type: 'text', text: 'No programs found' }],
          };
        }

        const programsList = programs.map((program, index) => 
          `${index + 1}. **${program.name}** (ID: ${program.id})\n   ${program.host_names ? `Hosts: ${program.host_names.join(', ')}\n   ` : ''}${program.tagline || ''}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `KEXP Programs (${programs.length} programs):\n\n${programsList}`,
            },
          ],
        };
      }

      case 'get_current_show': {
        const showsResponse = await kexpClient.getShows({ 
          limit: 1, 
          ordering: '-start_time' 
        });
        
        if (showsResponse.results.length === 0) {
          return {
            content: [{ type: 'text', text: 'No current show information available' }],
          };
        }

        const show = showsResponse.results[0];
        return {
          content: [
            {
              type: 'text',
              text: `Current show on KEXP:\n\n**${show.program_name}** (ID: ${show.id})\nHosts: ${show.host_names.join(', ')}\nStarted: ${new Date(show.start_time).toLocaleString()}\n${show.tagline ? `\n${show.tagline}` : ''}`,
            },
          ],
        };
      }

      case 'get_play_by_id': {
        const id = args?.id as number;
        if (!id) {
          throw new Error('ID parameter is required');
        }
        
        const play = await kexpClient.getPlayById(id);
        if (!play) {
          return {
            content: [{ type: 'text', text: `Play with ID ${id} not found` }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Play Details (ID: ${play.id}):\n\n**${play.artist}** - "${play.song}"\n${play.album ? `Album: ${play.album}\n` : ''}Aired: ${new Date(play.airdate).toLocaleString()}\n${play.rotation_status ? `Rotation: ${play.rotation_status}\n` : ''}Type: ${play.play_type}\nLocal: ${play.is_local ? 'Yes' : 'No'}\nRequest: ${play.is_request ? 'Yes' : 'No'}\n${play.comment ? `\nComment: ${play.comment}` : ''}`,
            },
          ],
        };
      }

      case 'get_host_by_id': {
        const id = args?.id as number;
        if (!id) {
          throw new Error('ID parameter is required');
        }
        
        const host = await kexpClient.getHostById(id);
        if (!host) {
          return {
            content: [{ type: 'text', text: `Host with ID ${id} not found` }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Host Details (ID: ${host.id}):\n\n**${host.name}**\nStatus: ${host.is_active ? 'Active' : 'Inactive'}\nLocation: ${host.location}`,
            },
          ],
        };
      }

      case 'get_show_by_id': {
        const id = args?.id as number;
        if (!id) {
          throw new Error('ID parameter is required');
        }
        
        const show = await kexpClient.getShowById(id);
        if (!show) {
          return {
            content: [{ type: 'text', text: `Show with ID ${id} not found` }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Show Details (ID: ${show.id}):\n\n**${show.program_name}**\nHosts: ${show.host_names.join(', ')}\nStarted: ${new Date(show.start_time).toLocaleString()}\n${show.program_tags ? `Tags: ${show.program_tags}\n` : ''}${show.tagline ? `\n${show.tagline}` : ''}`,
            },
          ],
        };
      }

      case 'get_program_by_id': {
        const id = args?.id as number;
        if (!id) {
          throw new Error('ID parameter is required');
        }
        
        const program = await kexpClient.getProgramById(id);
        if (!program) {
          return {
            content: [{ type: 'text', text: `Program with ID ${id} not found` }],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Program Details (ID: ${program.id}):\n\n**${program.name}**\n${program.host_names ? `Hosts: ${program.host_names.join(', ')}\n` : ''}Status: ${program.is_active ? 'Active' : 'Inactive'}\n${program.tags ? `Tags: ${program.tags}\n` : ''}${program.tagline ? `\n${program.tagline}` : ''}\n${program.description ? `\nDescription: ${program.description}` : ''}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KEXP MCP Server running on stdio');
}

runServer().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});