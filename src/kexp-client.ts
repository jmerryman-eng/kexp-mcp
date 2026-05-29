import fetch from 'node-fetch';
import {
  KexpPlay,
  KexpHost,
  KexpShow,
  KexpProgram,
  KexpTimeslot,
  PaginatedResponse,
  QueryParams,
  KexpApiClient
} from './types.js';

/**
 * KEXP interleaves non-track records (e.g. `play_type: "airbreak"`) into the
 * plays feed with null artist/song. The API ignores `play_type`/`search`
 * filters, so we guard for real tracks client-side.
 */
function isTrackPlay(play: KexpPlay): boolean {
  return !!play.artist && !!play.song;
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
}