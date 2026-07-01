import { describe, it, expect } from 'vitest';
import { handleToolCall, tools } from './mcp-server.js';
import { KexpClient } from './kexp-client.js';
import { KexpPlay, KexpShow, KexpTimeslot } from './types.js';

/** Build a CallToolRequest for a tool + args. */
function req(name: string, args: Record<string, unknown> = {}) {
  return { method: 'tools/call', params: { name, arguments: args } } as any;
}

/** Cast a partial stub to KexpClient for handler tests. */
function client(overrides: Partial<Record<keyof KexpClient, any>>): KexpClient {
  return overrides as unknown as KexpClient;
}

const samplePlay: KexpPlay = {
  id: 1, uri: '', airdate: '2026-06-30T12:00:00-07:00', show: 100, show_uri: '',
  song: 'Higher', artist: 'Kelly Lee Owens', album: 'LP', is_local: true,
  is_request: false, is_live: false, location: 1, location_name: 'Seattle',
  play_type: 'trackplay', rotation_status: 'Add', comment: 'A gorgeous remix.',
};

const sampleShow: KexpShow = {
  id: 100, uri: '', program: 1, program_uri: '', hosts: [1], host_uris: [],
  program_name: 'Drive Time', host_names: ['Kevin Cole'], tagline: 'Evening drive.',
  start_time: '2026-06-30T16:00:00-07:00', location: 1, location_name: 'Seattle',
};

describe('tool registry', () => {
  it('exposes the enriched/derived tools alongside the core ones', () => {
    const names = tools.map((t) => t.name);
    for (const expected of [
      'get_now_playing', 'get_today_context', 'get_new_music', 'get_local_artist_plays',
      'get_show_playlist', 'search_shows', 'get_shows_by_host', 'list_plays', 'list_shows',
      'get_timeslots', 'get_timeslot_by_id',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('has unique tool names', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('get_now_playing', () => {
  it('renders track, DJ comment, and show context', async () => {
    const c = client({ getNowPlaying: async () => ({ play: samplePlay, show: sampleShow }) });
    const res = await handleToolCall(c, req('get_now_playing'));
    const text = (res.content[0] as any).text;
    expect(text).toContain('Kelly Lee Owens');
    expect(text).toContain('DJ comment: A gorgeous remix.');
    expect(text).toContain('Drive Time');
    expect(text).toContain('Kevin Cole');
    expect(res.isError).toBeFalsy();
  });

  it('handles no current play', async () => {
    const c = client({ getNowPlaying: async () => null });
    const res = await handleToolCall(c, req('get_now_playing'));
    expect((res.content[0] as any).text).toMatch(/No current play/i);
  });
});

describe('get_show_playlist', () => {
  it('requires show_id', async () => {
    const c = client({ getShowPlaylist: async () => [] });
    const res = await handleToolCall(c, req('get_show_playlist', {}));
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toMatch(/show_id/);
  });

  it('lists the playlist when a show_id is given', async () => {
    const c = client({ getShowPlaylist: async () => [samplePlay] });
    const res = await handleToolCall(c, req('get_show_playlist', { show_id: 100 }));
    expect((res.content[0] as any).text).toContain('Kelly Lee Owens');
  });
});

describe('get_new_music', () => {
  it('reports when nothing matches', async () => {
    const c = client({ getNewMusic: async () => [] });
    const res = await handleToolCall(c, req('get_new_music', { rotation_status: 'Heavy' }));
    expect((res.content[0] as any).text).toMatch(/No "Heavy" rotation/);
  });
});

describe('get_shows_by_host', () => {
  it('requires a host name or id', async () => {
    const c = client({ getShowsByHost: async () => [] });
    const res = await handleToolCall(c, req('get_shows_by_host', {}));
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toMatch(/host_name or host_id/);
  });
});

describe('get_timeslot_by_id', () => {
  it('formats a found timeslot', async () => {
    const slot: KexpTimeslot = {
      id: 7, uri: '', program: 1, program_uri: '', program_name: 'Jazz Theatre',
      start_time: '01:00:00', end_time: '03:00:00', weekday: 1, location: 1, location_name: 'Seattle',
    };
    const c = client({ getTimeslotById: async () => slot });
    const res = await handleToolCall(c, req('get_timeslot_by_id', { id: 7 }));
    const text = (res.content[0] as any).text;
    expect(text).toContain('Jazz Theatre');
    expect(text).toContain('Monday');
  });

  it('reports a missing timeslot', async () => {
    const c = client({ getTimeslotById: async () => null });
    const res = await handleToolCall(c, req('get_timeslot_by_id', { id: 999 }));
    expect((res.content[0] as any).text).toMatch(/not found/);
  });
});
