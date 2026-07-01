import { describe, it, expect, vi, beforeEach } from 'vitest';

// node-fetch is the client's only I/O dependency; mock it so tests are hermetic.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
import fetch from 'node-fetch';
import {
  KexpClient,
  normalizeUtc,
  clampDateWindow,
  pacificDayBounds,
  dedupeShows,
} from './kexp-client.js';
import { KexpPlay, KexpShow } from './types.js';

const mockFetch = fetch as unknown as ReturnType<typeof vi.fn>;

function okResponse(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

/** Minimal play factory — only the fields the client actually inspects. */
function play(overrides: Partial<KexpPlay>): KexpPlay {
  return {
    id: 1,
    uri: '',
    airdate: '2026-06-30T12:00:00-07:00',
    show: 100,
    show_uri: '',
    song: 'Song',
    artist: 'Artist',
    is_local: false,
    is_request: false,
    is_live: false,
    location: 1,
    location_name: 'Seattle',
    play_type: 'trackplay',
    ...overrides,
  };
}

function show(overrides: Partial<KexpShow>): KexpShow {
  return {
    id: 1,
    uri: '',
    program: 1,
    program_uri: '',
    hosts: [],
    host_uris: [],
    program_name: 'Variety Mix',
    host_names: [],
    start_time: '2026-06-30T10:00:00-07:00',
    location: 1,
    location_name: 'Seattle',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('normalizeUtc', () => {
  it('treats a naive datetime as UTC and appends Z', () => {
    expect(normalizeUtc('2026-06-30T12:00:00')).toBe('2026-06-30T12:00:00.000Z');
  });

  it('preserves an explicit UTC datetime', () => {
    expect(normalizeUtc('2026-06-30T12:00:00Z')).toBe('2026-06-30T12:00:00.000Z');
  });

  it('converts an offset datetime to UTC', () => {
    // 12:00 at -07:00 == 19:00 UTC
    expect(normalizeUtc('2026-06-30T12:00:00-07:00')).toBe('2026-06-30T19:00:00.000Z');
  });
});

describe('clampDateWindow', () => {
  const now = new Date('2026-06-30T00:00:00Z');

  it('defaults to a 30-day window ending now', () => {
    const { after, before } = clampDateWindow(undefined, undefined, now);
    expect(before).toBe('2026-06-30T00:00:00.000Z');
    expect(after).toBe('2026-05-31T00:00:00.000Z');
  });

  it('clamps an out-of-range start to 30 days ago', () => {
    const { after } = clampDateWindow('2020-01-01T00:00:00Z', undefined, now);
    expect(after).toBe('2026-05-31T00:00:00.000Z');
  });

  it('honors an in-range start', () => {
    const { after } = clampDateWindow('2026-06-20T00:00:00Z', undefined, now);
    expect(after).toBe('2026-06-20T00:00:00.000Z');
  });
});

describe('pacificDayBounds', () => {
  it('returns midnight-to-midnight Pacific as UTC (PDT)', () => {
    // 2026-06-30 is during PDT (UTC-7); midnight PT == 07:00 UTC.
    const { start, end } = pacificDayBounds(new Date('2026-06-30T20:00:00Z'));
    expect(start).toBe('2026-06-30T07:00:00.000Z');
    expect(end).toBe('2026-07-01T07:00:00.000Z');
  });

  it('spans exactly 24 hours', () => {
    const { start, end } = pacificDayBounds(new Date('2026-01-15T20:00:00Z')); // PST (UTC-8)
    expect(start).toBe('2026-01-15T08:00:00.000Z');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('dedupeShows', () => {
  it('collapses same program+hosts to the earliest start, chronologically', () => {
    const input = [
      show({ id: 3, program_name: 'Drive Time', host_names: ['Kevin Cole'], start_time: '2026-06-30T16:00:52-07:00' }),
      show({ id: 2, program_name: 'Drive Time', host_names: ['Kevin Cole'], start_time: '2026-06-30T16:00:00-07:00' }),
      show({ id: 5, program_name: 'The Midday Show', host_names: ['Cheryl Waters'], start_time: '2026-06-30T10:00:00-07:00' }),
    ];
    const result = dedupeShows(input);
    expect(result).toHaveLength(2);
    // Midday (10:00) sorts before Drive Time (16:00)
    expect(result[0].program_name).toBe('The Midday Show');
    // The kept Drive Time is the earliest-start duplicate (id 2)
    expect(result[1].id).toBe(2);
  });
});

describe('getShowPlaylist', () => {
  it('fetches newest-first (to keep the show filter), reverses to chronological, drops airbreaks', async () => {
    // The API returns newest-first for `-airdate`; ids 3 -> 2 -> 1 is newest -> oldest.
    mockFetch.mockResolvedValueOnce(
      okResponse({
        results: [
          play({ id: 3, song: 'Third', airdate: '2026-06-30T12:20:00-07:00' }),
          play({ id: 2, artist: '', song: '', play_type: 'airbreak', airdate: '2026-06-30T12:10:00-07:00' }),
          play({ id: 1, song: 'First', airdate: '2026-06-30T12:00:00-07:00' }),
        ],
      })
    );

    const client = new KexpClient();
    const result = await client.getShowPlaylist(456, { limit: 10 });

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('/plays/');
    // `show_ids` (plural) is the real filter; singular `show` is ignored.
    expect(url).toContain('show_ids=456');
    expect(url).toContain('ordering=-airdate');
    // Output is chronological (oldest first) with the airbreak removed.
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('getLocalArtistPlays', () => {
  it('keeps only local plays (client-side filter)', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        results: [
          play({ id: 1, is_local: true }),
          play({ id: 2, is_local: false }),
          play({ id: 3, is_local: true }),
        ],
      })
    );

    const client = new KexpClient();
    const result = await client.getLocalArtistPlays({ limit: 10 });
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('getNewMusic', () => {
  it('keeps only plays matching the requested rotation status', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        results: [
          play({ id: 1, rotation_status: 'Add' }),
          play({ id: 2, rotation_status: 'Library' }),
          play({ id: 3, rotation_status: 'add' }), // case-insensitive
        ],
      })
    );

    const client = new KexpClient();
    const result = await client.getNewMusic({ rotation_status: 'Add', limit: 10 });
    expect(result.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe('getShowsByHost', () => {
  it('matches shows by host name substring (case-insensitive)', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({
        results: [
          show({ id: 1, host_names: ['Kevin Cole'] }),
          show({ id: 2, host_names: ['Cheryl Waters'] }),
          show({ id: 3, host_names: ['kevin cole'] }),
        ],
      })
    );

    const client = new KexpClient();
    const result = await client.getShowsByHost({ host_name: 'kevin', limit: 10 });
    expect(result.map((s) => s.id)).toEqual([1, 3]);
  });
});
