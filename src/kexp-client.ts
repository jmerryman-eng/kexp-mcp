import fetch from 'node-fetch';
import {
  KexpPlay,
  KexpHost,
  KexpShow,
  KexpProgram,
  KexpTimeslot,
  PaginatedResponse,
  QueryParams,
  KexpApiClient,
  NowPlaying,
  TodayContextShow,
} from './types.js';

/**
 * KEXP interleaves non-track records (e.g. `play_type: "airbreak"`) into the
 * plays feed with null artist/song. The API ignores `play_type`/`search`
 * filters, so we guard for real tracks client-side.
 */
function isTrackPlay(play: KexpPlay): boolean {
  return !!play.artist && !!play.song;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * The KEXP API interprets a naive datetime (no timezone) as Pacific time, which
 * silently shifts query windows by 7–8 hours. Always send explicit UTC: if the
 * caller's string has no timezone we treat it as UTC, then normalize to `...Z`.
 */
export function normalizeUtc(iso: string): string {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.trim());
  return new Date(hasTz ? iso : `${iso}Z`).toISOString();
}

/**
 * Clamp a date range to a window no older than 30 days (matches the reference
 * server's upstream-load guard). Missing bounds default to [30 days ago, now].
 * Returns UTC ISO strings usable as `airdate_*` or `start_time_*` params.
 */
export function clampDateWindow(
  after?: string,
  before?: string,
  now: Date = new Date()
): { after: string; before: string } {
  const beforeD = before ? new Date(normalizeUtc(before)) : now;
  const earliest = new Date(now.getTime() - THIRTY_DAYS_MS);
  let afterD = after ? new Date(normalizeUtc(after)) : earliest;
  if (afterD < earliest) afterD = earliest;
  return { after: afterD.toISOString(), before: beforeD.toISOString() };
}

/** Offset (ms) between a timezone's wall-clock and UTC at a given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const m: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') m[part.type] = part.value;
  }
  let hour = parseInt(m.hour, 10);
  if (hour === 24) hour = 0; // some environments render midnight as 24
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, hour, +m.minute, +m.second);
  return asUtc - date.getTime();
}

/**
 * Start/end of "today" in Pacific time (where KEXP broadcasts), as UTC ISO
 * strings. DST-safe: the offset is measured at the candidate instant.
 */
export function pacificDayBounds(now: Date = new Date()): { start: string; end: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // en-CA renders as YYYY-MM-DD
  const guess = new Date(`${ymd}T00:00:00Z`);
  const start = new Date(guess.getTime() - tzOffsetMs(guess, PACIFIC_TZ));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * KEXP occasionally stores several near-duplicate show records for one on-air
 * block (same program + hosts, start times seconds apart). Collapse them to a
 * single entry per (program, hosts), keeping the earliest start, ordered
 * chronologically.
 */
export function dedupeShows(shows: KexpShow[]): KexpShow[] {
  const byKey = new Map<string, KexpShow>();
  for (const show of shows) {
    const key = `${show.program_name}|${(show.host_names || []).join(',')}`;
    const existing = byKey.get(key);
    if (!existing || new Date(show.start_time) < new Date(existing.start_time)) {
      byKey.set(key, show);
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

export class KexpClient implements KexpApiClient {
  private baseUrl = 'https://api.kexp.org/v2';

  private async makeRequest<T>(endpoint: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`KEXP API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async getPlays(params?: QueryParams): Promise<PaginatedResponse<KexpPlay>> {
    return this.makeRequest<PaginatedResponse<KexpPlay>>('/plays/', params);
  }

  async getHosts(params?: QueryParams): Promise<PaginatedResponse<KexpHost>> {
    return this.makeRequest<PaginatedResponse<KexpHost>>('/hosts/', params);
  }

  async getShows(params?: QueryParams): Promise<PaginatedResponse<KexpShow>> {
    return this.makeRequest<PaginatedResponse<KexpShow>>('/shows/', params);
  }

  async getPrograms(params?: QueryParams): Promise<PaginatedResponse<KexpProgram>> {
    return this.makeRequest<PaginatedResponse<KexpProgram>>('/programs/', params);
  }

  async getTimeslots(params?: QueryParams): Promise<PaginatedResponse<KexpTimeslot>> {
    return this.makeRequest<PaginatedResponse<KexpTimeslot>>('/timeslots/', params);
  }

  async getCurrentPlay(): Promise<KexpPlay | null> {
    try {
      // Over-fetch a small window: the newest record may be an airbreak, so
      // return the most recent actual track instead of "undefined - undefined".
      const response = await this.getPlays({
        limit: 5,
        ordering: '-airdate'
      });
      return response.results.find(isTrackPlay) || null;
    } catch (error) {
      console.error('Error fetching current play:', error);
      return null;
    }
  }

  async getRecentPlays(limit: number = 10): Promise<KexpPlay[]> {
    try {
      // Over-fetch to compensate for airbreaks filtered out below, so the
      // caller still gets close to `limit` real tracks.
      const response = await this.getPlays({
        limit: Math.min(limit + 20, 100),
        ordering: '-airdate'
      });
      return response.results.filter(isTrackPlay).slice(0, limit);
    } catch (error) {
      console.error('Error fetching recent plays:', error);
      return [];
    }
  }

  async getPlayById(id: number): Promise<KexpPlay | null> {
    try {
      return await this.makeRequest<KexpPlay>(`/plays/${id}/`);
    } catch (error) {
      console.error(`Error fetching play ${id}:`, error);
      return null;
    }
  }

  async getHostById(id: number): Promise<KexpHost | null> {
    try {
      return await this.makeRequest<KexpHost>(`/hosts/${id}/`);
    } catch (error) {
      console.error(`Error fetching host ${id}:`, error);
      return null;
    }
  }

  async getShowById(id: number): Promise<KexpShow | null> {
    try {
      return await this.makeRequest<KexpShow>(`/shows/${id}/`);
    } catch (error) {
      console.error(`Error fetching show ${id}:`, error);
      return null;
    }
  }

  async getProgramById(id: number): Promise<KexpProgram | null> {
    try {
      return await this.makeRequest<KexpProgram>(`/programs/${id}/`);
    } catch (error) {
      console.error(`Error fetching program ${id}:`, error);
      return null;
    }
  }

  async searchPlays(query: string, limit: number = 10): Promise<KexpPlay[]> {
    try {
      // The KEXP API has no generic `search` param (it silently ignores it),
      // but supports case-insensitive partial-match `artist`/`song`/`album`
      // filters. Query each and merge so a single term searches all three.
      const responses = await Promise.all(
        (['artist', 'song', 'album'] as const).map(field =>
          this.getPlays({ limit, ordering: '-airdate', [field]: query })
            .catch(() => ({ results: [] } as unknown as PaginatedResponse<KexpPlay>))
        )
      );

      const seen = new Set<number>();
      const merged: KexpPlay[] = [];
      for (const response of responses) {
        for (const play of response.results) {
          if (isTrackPlay(play) && !seen.has(play.id)) {
            seen.add(play.id);
            merged.push(play);
          }
        }
      }

      merged.sort((a, b) => new Date(b.airdate).getTime() - new Date(a.airdate).getTime());
      return merged.slice(0, limit);
    } catch (error) {
      console.error('Error searching plays:', error);
      return [];
    }
  }

  async getTimeslotById(id: number): Promise<KexpTimeslot | null> {
    try {
      return await this.makeRequest<KexpTimeslot>(`/timeslots/${id}/`);
    } catch (error) {
      console.error(`Error fetching timeslot ${id}:`, error);
      return null;
    }
  }

  /**
   * Page through the plays feed (newest first within the given params),
   * collecting real tracks that match `predicate`, until `target` are found or
   * the feed / page budget is exhausted. Used for filters the API ignores
   * server-side (is_local, rotation_status).
   */
  private async collectFilteredPlays(
    baseParams: QueryParams,
    predicate: (play: KexpPlay) => boolean,
    target: number,
    maxPages = 5,
    pageSize = 100
  ): Promise<KexpPlay[]> {
    const out: KexpPlay[] = [];
    for (let page = 0; page < maxPages && out.length < target; page++) {
      const response = await this.getPlays({
        ...baseParams,
        limit: pageSize,
        offset: page * pageSize,
      });
      if (response.results.length === 0) break;
      for (const play of response.results) {
        if (isTrackPlay(play) && predicate(play)) out.push(play);
      }
      if (response.results.length < pageSize) break;
    }
    return out.slice(0, target);
  }

  async getShowPlaylist(
    showId: number,
    options: { limit?: number; offset?: number; includeAirbreaks?: boolean } = {}
  ): Promise<KexpPlay[]> {
    const { limit = 100, offset = 0, includeAirbreaks = false } = options;
    // The plays endpoint filters by `show_ids` (plural); the singular `show`
    // param is silently ignored. Fetch newest-first, then reverse to
    // chronological order. A single show fits well within 200 records, so this
    // captures the whole playlist.
    const response = await this.getPlays({
      show_ids: showId,
      ordering: '-airdate',
      limit: 200,
    });
    const chronological = [...response.results].reverse();
    const plays = includeAirbreaks ? chronological : chronological.filter(isTrackPlay);
    return plays.slice(offset, offset + limit);
  }

  async getNewMusic(options: {
    rotation_status?: string;
    artist?: string;
    airdate_after?: string;
    airdate_before?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<KexpPlay[]> {
    const { rotation_status = 'Heavy', artist, airdate_after, airdate_before, limit = 20, offset = 0 } = options;
    const window = clampDateWindow(airdate_after, airdate_before);
    const wanted = rotation_status.toLowerCase();
    // rotation_status is ignored server-side, so filter client-side.
    const matches = await this.collectFilteredPlays(
      { ordering: '-airdate', airdate_after: window.after, airdate_before: window.before, artist },
      (play) => (play.rotation_status || '').toLowerCase() === wanted,
      offset + limit
    );
    return matches.slice(offset, offset + limit);
  }

  async getLocalArtistPlays(options: {
    artist?: string;
    airdate_after?: string;
    airdate_before?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<KexpPlay[]> {
    const { artist, airdate_after, airdate_before, limit = 20, offset = 0 } = options;
    const window = clampDateWindow(airdate_after, airdate_before);
    // is_local is ignored server-side, so filter client-side.
    const matches = await this.collectFilteredPlays(
      { ordering: '-airdate', airdate_after: window.after, airdate_before: window.before, artist },
      (play) => play.is_local === true,
      offset + limit
    );
    return matches.slice(offset, offset + limit);
  }

  /**
   * Page through shows within a (≤30-day) window, keeping those that match a
   * predicate. The shows endpoint ignores `program`/host filters server-side,
   * so all such filtering is client-side.
   */
  private async collectFilteredShows(
    window: { after: string; before: string },
    predicate: (show: KexpShow) => boolean,
    target: number,
    maxPages = 6,
    pageSize = 100
  ): Promise<KexpShow[]> {
    const out: KexpShow[] = [];
    for (let page = 0; page < maxPages && out.length < target; page++) {
      const response = await this.getShows({
        ordering: '-start_time',
        start_time_after: window.after,
        start_time_before: window.before,
        limit: pageSize,
        offset: page * pageSize,
      });
      if (response.results.length === 0) break;
      for (const show of response.results) {
        if (predicate(show)) out.push(show);
      }
      if (response.results.length < pageSize) break;
    }
    return out.slice(0, target);
  }

  async getShowsByHost(options: {
    host_name?: string;
    host_id?: number;
    start_time_after?: string;
    start_time_before?: string;
    limit?: number;
    offset?: number;
  }): Promise<KexpShow[]> {
    const { host_name, host_id, start_time_after, start_time_before, limit = 20, offset = 0 } = options;
    const window = clampDateWindow(start_time_after, start_time_before);
    const nameLc = host_name?.toLowerCase();
    const matches = await this.collectFilteredShows(
      window,
      (show) => {
        const byId = host_id != null && (show.hosts || []).includes(host_id);
        const byName = !!nameLc && (show.host_names || []).some((n) => n.toLowerCase().includes(nameLc));
        return byId || byName;
      },
      offset + limit
    );
    return matches.slice(offset, offset + limit);
  }

  async searchShows(options: {
    keyword: string;
    start_time_after?: string;
    start_time_before?: string;
    limit?: number;
  }): Promise<KexpShow[]> {
    const { keyword, start_time_after, start_time_before, limit = 50 } = options;
    const window = clampDateWindow(start_time_after, start_time_before);
    const kw = keyword.toLowerCase();
    return this.collectFilteredShows(
      window,
      (show) =>
        (show.tagline || '').toLowerCase().includes(kw) ||
        (show.program_name || '').toLowerCase().includes(kw),
      limit
    );
  }

  /** Currently-playing track enriched with its show/host/program context. */
  async getNowPlaying(): Promise<NowPlaying | null> {
    const play = await this.getCurrentPlay();
    if (!play) return null;
    let show: KexpShow | null = null;
    if (play.show) {
      show = await this.getShowById(play.show);
    }
    return { play, show };
  }

  /** Today's shows (Pacific time) each paired with a few sample plays. */
  async getTodayContext(samplePerShow = 3): Promise<TodayContextShow[]> {
    const { start, end } = pacificDayBounds();
    const response = await this.getShows({
      ordering: '-start_time',
      start_time_after: start,
      start_time_before: end,
      limit: 100,
    });
    const shows = dedupeShows(response.results);
    const out: TodayContextShow[] = [];
    for (const show of shows) {
      // Filter by `show_ids` (the singular `show` param is ignored).
      const plays = await this.getPlays({ show_ids: show.id, ordering: '-airdate', limit: 12 });
      const sample = plays.results.filter(isTrackPlay).slice(0, samplePerShow);
      out.push({ show, sample_plays: sample });
    }
    return out;
  }

  /** General play listing with the filters the API actually honors + airbreak guard. */
  async listPlays(options: {
    artist?: string;
    song?: string;
    album?: string;
    show_id?: number;
    airdate_after?: string;
    airdate_before?: string;
    ordering?: string;
    exclude_airbreaks?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<KexpPlay[]> {
    const {
      artist, song, album, show_id, airdate_after, airdate_before,
      ordering = '-airdate', exclude_airbreaks = true, limit = 20, offset = 0,
    } = options;
    const params: QueryParams = {
      ordering,
      offset,
      limit: exclude_airbreaks ? Math.min(limit + 30, 200) : limit,
    };
    if (artist) params.artist = artist;
    if (song) params.song = song;
    if (album) params.album = album;
    if (show_id != null) params.show_ids = show_id;
    if (airdate_after) params.airdate_after = normalizeUtc(airdate_after);
    if (airdate_before) params.airdate_before = normalizeUtc(airdate_before);

    const response = await this.getPlays(params);
    const plays = exclude_airbreaks ? response.results.filter(isTrackPlay) : response.results;
    return plays.slice(0, limit);
  }

  /** General show listing; `program`/`host` are filtered client-side (API ignores them). */
  async listShows(options: {
    program?: number;
    host?: string;
    start_time_after?: string;
    start_time_before?: string;
    ordering?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<KexpShow[]> {
    const { program, host, start_time_after, start_time_before, ordering = '-start_time', limit = 20, offset = 0 } = options;
    const needsClientFilter = program != null || !!host;
    const params: QueryParams = {
      ordering,
      offset,
      limit: needsClientFilter ? 100 : limit,
    };
    if (start_time_after) params.start_time_after = normalizeUtc(start_time_after);
    if (start_time_before) params.start_time_before = normalizeUtc(start_time_before);

    const response = await this.getShows(params);
    let shows = response.results;
    if (program != null) shows = shows.filter((s) => s.program === program);
    if (host) {
      const h = host.toLowerCase();
      shows = shows.filter((s) => (s.host_names || []).some((n) => n.toLowerCase().includes(h)));
    }
    return shows.slice(0, limit);
  }
}