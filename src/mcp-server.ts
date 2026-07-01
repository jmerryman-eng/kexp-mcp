import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  CallToolResult,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { KexpClient } from './kexp-client.js';
import { KexpPlay, KexpShow, KexpTimeslot } from './types.js';

/** 1=Mon … 7=Sun, matching the KEXP timeslots `weekday` field. */
const WEEKDAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** One play rendered as a markdown list item, surfacing local/request/rotation flags and the DJ comment. */
function formatPlayLine(play: KexpPlay): string {
  const flags = [
    play.is_local ? 'Local' : null,
    play.is_request ? 'Request' : null,
    play.is_live ? 'Live' : null,
    play.rotation_status ? `Rotation: ${play.rotation_status}` : null,
  ].filter(Boolean).join(' · ');
  return `**${play.artist}** – "${play.song}"${play.album ? ` (${play.album})` : ''}\n   Aired: ${new Date(play.airdate).toLocaleString()}${flags ? `\n   ${flags}` : ''}${play.comment ? `\n   💬 ${play.comment}` : ''}`;
}

/** One show rendered as a markdown list item, with hosts and tagline. */
function formatShowLine(show: KexpShow): string {
  return `**${show.program_name}** (ID: ${show.id})${show.host_names?.length ? `\n   Hosts: ${show.host_names.join(', ')}` : ''}\n   Started: ${new Date(show.start_time).toLocaleString()}${show.tagline ? `\n   ${show.tagline}` : ''}`;
}

/** One timeslot rendered as a markdown list item. */
function formatTimeslotLine(slot: KexpTimeslot): string {
  const day = WEEKDAY_NAMES[slot.weekday] || `Weekday ${slot.weekday}`;
  return `**${slot.program_name}** (ID: ${slot.id})\n   ${day} ${slot.start_time}–${slot.end_time}${slot.program_tags ? `\n   Tags: ${slot.program_tags}` : ''}`;
}

/**
 * Shared KEXP tool definitions and call handler used by both transports
 * (stdio in index.ts, Streamable HTTP in http-server.ts) so the exposed
 * toolset never drifts between them.
 */
export const tools: Tool[] = [
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
  {
    name: 'get_now_playing',
    description:
      "Get the song playing on KEXP right now, enriched in one call with the DJ's comment, the current show name, host(s), and tagline. Best entry point for \"what's on KEXP right now?\" — the DJ comment often carries artist backstory, dedications, and session links.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_today_context',
    description:
      "Get a rich picture of what's on KEXP today (Pacific time): every show airing today with its hosts, tagline, and a sample of DJ comments that reveal the editorial themes and mood. Use this first for questions like \"what's on KEXP today?\" — taglines and comments often reveal themed days and special programming not visible in structured fields.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_new_music',
    description:
      'Find music KEXP is currently championing, by rotation status. KEXP\'s live rotation vocabulary is "Heavy" (heaviest airplay — the default and best signal for "what is KEXP pushing right now?"), "Medium", and "Light"; "Add" is accepted for newly-added tracks but is rarely present. Answers "what new music is KEXP excited about?". Limited to the past 30 days.',
    inputSchema: {
      type: 'object',
      properties: {
        rotation_status: {
          type: 'string',
          enum: ['Heavy', 'Medium', 'Light', 'Add'],
          description: '"Heavy" (default) = tracks in heaviest rotation; "Medium"/"Light" = lower rotation; "Add" = newly added (rare).',
        },
        artist: { type: 'string', description: 'Optional artist name filter (case-insensitive substring).' },
        airdate_after: { type: 'string', description: 'ISO 8601 datetime; only plays after this. Must be within the past 30 days.' },
        airdate_before: { type: 'string', description: 'ISO 8601 datetime; only plays before this. Must be within the past 30 days.' },
        limit: { type: 'number', description: 'Number of results (default 20, max 50)', minimum: 1, maximum: 50 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'get_local_artist_plays',
    description:
      'Find plays of Pacific Northwest / local artists on KEXP within the past 30 days. Championing local Seattle & PNW artists is core to KEXP\'s identity. Each result includes the DJ comment and show context. Answers "what local artists has KEXP been playing?".',
    inputSchema: {
      type: 'object',
      properties: {
        artist: { type: 'string', description: 'Optional artist name filter (case-insensitive substring).' },
        airdate_after: { type: 'string', description: 'ISO 8601 datetime; only plays after this. Must be within the past 30 days.' },
        airdate_before: { type: 'string', description: 'ISO 8601 datetime; only plays before this. Must be within the past 30 days.' },
        limit: { type: 'number', description: 'Number of results (default 20, max 50)', minimum: 1, maximum: 50 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'get_show_playlist',
    description:
      'Get all songs played during a specific KEXP show (by show ID), in airdate order, each with its DJ comment, rotation status, and local/request/live flags. Use to answer "what did [DJ] play last night?" — first find the show ID with search_shows / get_shows_by_host / list_shows.',
    inputSchema: {
      type: 'object',
      properties: {
        show_id: { type: 'number', description: 'The numeric show ID.' },
        limit: { type: 'number', description: 'Number of results (default 100, max 200)', minimum: 1, maximum: 200 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
        include_airbreaks: { type: 'boolean', description: 'Include station-break/non-music segments (default false).' },
      },
      required: ['show_id'],
    },
  },
  {
    name: 'search_shows',
    description:
      'Search KEXP show history within the past 30 days by keyword, matching show taglines and program names (case-insensitive). Use for themed/special broadcasts — e.g. "Goth Day", a Bowie tribute. Taglines are DJ-written and often hold context not in any structured field.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search term matched against taglines and program names.' },
        start_time_after: { type: 'string', description: 'ISO 8601 datetime; only shows after this. Must be within the past 30 days.' },
        start_time_before: { type: 'string', description: 'ISO 8601 datetime; only shows before this. Must be within the past 30 days.' },
        limit: { type: 'number', description: 'Max results (default 50)', minimum: 1, maximum: 100 },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_shows_by_host',
    description:
      'Find KEXP shows hosted by a specific DJ within the past 30 days. Accepts a host name (partial, case-insensitive) or a numeric host ID. Answers "what has [DJ] hosted recently?". Filtering is client-side since the shows endpoint has no host filter.',
    inputSchema: {
      type: 'object',
      properties: {
        host_name: { type: 'string', description: 'Host name or partial name (case-insensitive). Provide this or host_id.' },
        host_id: { type: 'number', description: 'Numeric host ID. Provide this or host_name.' },
        start_time_after: { type: 'string', description: 'ISO 8601 datetime; only shows after this. Must be within the past 30 days.' },
        start_time_before: { type: 'string', description: 'ISO 8601 datetime; only shows before this. Must be within the past 30 days.' },
        limit: { type: 'number', description: 'Number of results (default 20, max 50)', minimum: 1, maximum: 50 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'list_plays',
    description:
      'List plays with the full set of supported filters: artist, song, album, show_id, airdate range, and ordering. Airbreaks are excluded by default. A richer alternative to get_recent_plays.',
    inputSchema: {
      type: 'object',
      properties: {
        artist: { type: 'string', description: 'Filter by artist (case-insensitive substring).' },
        song: { type: 'string', description: 'Filter by song title (case-insensitive substring).' },
        album: { type: 'string', description: 'Filter by album (case-insensitive substring).' },
        show_id: { type: 'number', description: 'Only plays from this show ID.' },
        airdate_after: { type: 'string', description: 'ISO 8601 datetime; only plays after this.' },
        airdate_before: { type: 'string', description: 'ISO 8601 datetime; only plays before this.' },
        ordering: { type: 'string', description: 'Sort order, e.g. "-airdate" (newest first, default) or "airdate".' },
        exclude_airbreaks: { type: 'boolean', description: 'Exclude non-music segments (default true).' },
        limit: { type: 'number', description: 'Number of results (default 20, max 100)', minimum: 1, maximum: 100 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'list_shows',
    description:
      'List KEXP broadcast episodes (shows). Filter by program ID, host name, and start-time range. program/host filters are applied client-side.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'number', description: 'Filter by program ID.' },
        host: { type: 'string', description: 'Filter by host name (case-insensitive substring).' },
        start_time_after: { type: 'string', description: 'ISO 8601 datetime; only shows after this.' },
        start_time_before: { type: 'string', description: 'ISO 8601 datetime; only shows before this.' },
        ordering: { type: 'string', description: 'Sort order, e.g. "-start_time" (newest first, default).' },
        limit: { type: 'number', description: 'Number of results (default 20, max 50)', minimum: 1, maximum: 50 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'get_timeslots',
    description:
      'List KEXP weekly schedule timeslots (the recurring grid). Filter by weekday (1=Mon … 7=Sun) or program ID. Use to answer "what normally airs on Tuesday nights?".',
    inputSchema: {
      type: 'object',
      properties: {
        weekday: { type: 'number', description: 'Weekday 1=Mon … 7=Sun.', minimum: 1, maximum: 7 },
        program: { type: 'number', description: 'Filter by program ID.' },
        limit: { type: 'number', description: 'Number of results (default 30, max 100)', minimum: 1, maximum: 100 },
        offset: { type: 'number', description: 'Results to skip for pagination (default 0)', minimum: 0 },
      },
    },
  },
  {
    name: 'get_timeslot_by_id',
    description: 'Get detailed information about a specific weekly timeslot by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The timeslot ID' },
      },
      required: ['id'],
    },
  },
];

/**
 * Execute a single tool call against the KEXP API and format the result.
 */
export async function handleToolCall(
  kexpClient: KexpClient,
  request: CallToolRequest
): Promise<CallToolResult> {
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

        return {
          content: [
            {
              type: 'text',
              text: `Currently playing on KEXP:\n\n**${currentPlay.artist}** - "${currentPlay.song}"\n${currentPlay.album ? `Album: ${currentPlay.album}\n` : ''}Aired: ${new Date(currentPlay.airdate).toLocaleString()}\n${currentPlay.rotation_status ? `Rotation: ${currentPlay.rotation_status}\n` : ''}${currentPlay.comment ? `\nComment: ${currentPlay.comment}` : ''}`,
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

      case 'get_now_playing': {
        const nowPlaying = await kexpClient.getNowPlaying();
        if (!nowPlaying) {
          return { content: [{ type: 'text', text: 'No current play information available' }] };
        }

        const { play, show } = nowPlaying;
        const showBlock = show
          ? `\n\n**Show:** ${show.program_name}${show.host_names?.length ? ` with ${show.host_names.join(', ')}` : ''}${show.tagline ? `\n**Tagline:** ${show.tagline}` : ''}`
          : '';

        return {
          content: [
            {
              type: 'text',
              text: `Now playing on KEXP:\n\n**${play.artist}** – "${play.song}"${play.album ? `\nAlbum: ${play.album}` : ''}\nAired: ${new Date(play.airdate).toLocaleString()}${play.rotation_status ? `\nRotation: ${play.rotation_status}` : ''}${play.is_local ? `\nLocal artist: yes` : ''}${play.comment ? `\n\n💬 DJ comment: ${play.comment}` : ''}${showBlock}`,
            },
          ],
        };
      }

      case 'get_today_context': {
        const context = await kexpClient.getTodayContext();
        if (context.length === 0) {
          return { content: [{ type: 'text', text: 'No shows found for today.' }] };
        }

        const blocks = context.map(({ show, sample_plays }) => {
          const comments = sample_plays
            .filter((p) => p.comment)
            .slice(0, 2)
            .map((p) => `   💬 ${p.artist}: ${p.comment}`)
            .join('\n');
          return `**${show.program_name}**${show.host_names?.length ? ` with ${show.host_names.join(', ')}` : ''}\n   Started: ${new Date(show.start_time).toLocaleString()}${show.tagline ? `\n   ${show.tagline}` : ''}${comments ? `\n${comments}` : ''}`;
        }).join('\n\n');

        return {
          content: [{ type: 'text', text: `KEXP today (${context.length} shows):\n\n${blocks}` }],
        };
      }

      case 'get_new_music': {
        const rotation = (args?.rotation_status as string) || 'Heavy';
        const plays = await kexpClient.getNewMusic({
          rotation_status: rotation,
          artist: args?.artist as string,
          airdate_after: args?.airdate_after as string,
          airdate_before: args?.airdate_before as string,
          limit: Math.min((args?.limit as number) || 20, 50),
          offset: (args?.offset as number) || 0,
        });

        if (plays.length === 0) {
          return { content: [{ type: 'text', text: `No "${rotation}" rotation tracks found in the last 30 days.` }] };
        }

        const list = plays.map((play, i) => `${i + 1}. ${formatPlayLine(play)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `New music on KEXP (rotation: ${rotation}, ${plays.length} tracks):\n\n${list}` }],
        };
      }

      case 'get_local_artist_plays': {
        const plays = await kexpClient.getLocalArtistPlays({
          artist: args?.artist as string,
          airdate_after: args?.airdate_after as string,
          airdate_before: args?.airdate_before as string,
          limit: Math.min((args?.limit as number) || 20, 50),
          offset: (args?.offset as number) || 0,
        });

        if (plays.length === 0) {
          return { content: [{ type: 'text', text: 'No local (PNW) artist plays found in the last 30 days.' }] };
        }

        const list = plays.map((play, i) => `${i + 1}. ${formatPlayLine(play)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Local artist plays on KEXP (${plays.length} tracks):\n\n${list}` }],
        };
      }

      case 'get_show_playlist': {
        const showId = args?.show_id as number;
        if (!showId) {
          throw new Error('show_id parameter is required');
        }

        const plays = await kexpClient.getShowPlaylist(showId, {
          limit: Math.min((args?.limit as number) || 100, 200),
          offset: (args?.offset as number) || 0,
          includeAirbreaks: (args?.include_airbreaks as boolean) === true,
        });

        if (plays.length === 0) {
          return { content: [{ type: 'text', text: `No plays found for show ${showId}.` }] };
        }

        const list = plays.map((play, i) => `${i + 1}. ${formatPlayLine(play)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Playlist for show ${showId} (${plays.length} tracks):\n\n${list}` }],
        };
      }

      case 'search_shows': {
        const keyword = args?.keyword as string;
        if (!keyword) {
          throw new Error('keyword parameter is required');
        }

        const shows = await kexpClient.searchShows({
          keyword,
          start_time_after: args?.start_time_after as string,
          start_time_before: args?.start_time_before as string,
          limit: Math.min((args?.limit as number) || 50, 100),
        });

        if (shows.length === 0) {
          return { content: [{ type: 'text', text: `No shows found matching "${keyword}" in the last 30 days.` }] };
        }

        const list = shows.map((show, i) => `${i + 1}. ${formatShowLine(show)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Shows matching "${keyword}" (${shows.length}):\n\n${list}` }],
        };
      }

      case 'get_shows_by_host': {
        const hostName = args?.host_name as string;
        const hostId = args?.host_id as number;
        if (!hostName && !hostId) {
          throw new Error('Either host_name or host_id is required');
        }

        const shows = await kexpClient.getShowsByHost({
          host_name: hostName,
          host_id: hostId,
          start_time_after: args?.start_time_after as string,
          start_time_before: args?.start_time_before as string,
          limit: Math.min((args?.limit as number) || 20, 50),
          offset: (args?.offset as number) || 0,
        });

        if (shows.length === 0) {
          return { content: [{ type: 'text', text: `No shows found for host ${hostName || hostId} in the last 30 days.` }] };
        }

        const list = shows.map((show, i) => `${i + 1}. ${formatShowLine(show)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Shows hosted by ${hostName || `#${hostId}`} (${shows.length}):\n\n${list}` }],
        };
      }

      case 'list_plays': {
        const plays = await kexpClient.listPlays({
          artist: args?.artist as string,
          song: args?.song as string,
          album: args?.album as string,
          show_id: args?.show_id as number,
          airdate_after: args?.airdate_after as string,
          airdate_before: args?.airdate_before as string,
          ordering: args?.ordering as string,
          exclude_airbreaks: (args?.exclude_airbreaks as boolean) !== false,
          limit: Math.min((args?.limit as number) || 20, 100),
          offset: (args?.offset as number) || 0,
        });

        if (plays.length === 0) {
          return { content: [{ type: 'text', text: 'No plays found for those filters.' }] };
        }

        const list = plays.map((play, i) => `${i + 1}. ${formatPlayLine(play)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Plays (${plays.length}):\n\n${list}` }],
        };
      }

      case 'list_shows': {
        const shows = await kexpClient.listShows({
          program: args?.program as number,
          host: args?.host as string,
          start_time_after: args?.start_time_after as string,
          start_time_before: args?.start_time_before as string,
          ordering: args?.ordering as string,
          limit: Math.min((args?.limit as number) || 20, 50),
          offset: (args?.offset as number) || 0,
        });

        if (shows.length === 0) {
          return { content: [{ type: 'text', text: 'No shows found for those filters.' }] };
        }

        const list = shows.map((show, i) => `${i + 1}. ${formatShowLine(show)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `Shows (${shows.length}):\n\n${list}` }],
        };
      }

      case 'get_timeslots': {
        const limit = Math.min((args?.limit as number) || 30, 100);
        const offset = (args?.offset as number) || 0;
        const weekday = args?.weekday as number | undefined;
        const program = args?.program as number | undefined;
        const filtering = weekday != null || program != null;

        // The timeslots endpoint ignores `weekday`/`program` filters (verified
        // against the live API) and holds only ~60 rows total, so fetch the
        // whole grid and filter/paginate client-side.
        const timeslotsResponse = await kexpClient.getTimeslots({
          limit: filtering ? 200 : limit,
          offset: filtering ? 0 : offset,
          ordering: 'weekday',
        });

        let timeslots = timeslotsResponse.results;
        if (weekday != null) {
          timeslots = timeslots.filter((slot) => slot.weekday === weekday);
        }
        if (program != null) {
          timeslots = timeslots.filter((slot) => slot.program === program);
        }
        if (filtering) {
          timeslots = timeslots.slice(offset, offset + limit);
        }

        if (timeslots.length === 0) {
          return { content: [{ type: 'text', text: 'No timeslots found.' }] };
        }

        const list = timeslots.map((slot, i) => `${i + 1}. ${formatTimeslotLine(slot)}`).join('\n\n');
        return {
          content: [{ type: 'text', text: `KEXP timeslots (${timeslots.length}):\n\n${list}` }],
        };
      }

      case 'get_timeslot_by_id': {
        const id = args?.id as number;
        if (!id) {
          throw new Error('ID parameter is required');
        }

        const slot = await kexpClient.getTimeslotById(id);
        if (!slot) {
          return { content: [{ type: 'text', text: `Timeslot with ID ${id} not found` }] };
        }

        return {
          content: [{ type: 'text', text: `Timeslot Details (ID: ${slot.id}):\n\n${formatTimeslotLine(slot)}` }],
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
}

/**
 * Build a KEXP MCP Server with the shared toolset and handlers wired up.
 * Transport (stdio / HTTP) is attached by the caller.
 */
export function createKexpMcpServer(): Server {
  const server = new Server(
    {
      name: 'kexp-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const kexpClient = new KexpClient();

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(kexpClient, request)
  );

  return server;
}
