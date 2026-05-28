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
      const response = await this.getPlays({ 
        limit: 1, 
        ordering: '-airdate' 
      });
      return response.results[0] || null;
    } catch (error) {
      console.error('Error fetching current play:', error);
      return null;
    }
  }

  async getRecentPlays(limit: number = 10): Promise<KexpPlay[]> {
    try {
      const response = await this.getPlays({ 
        limit, 
        ordering: '-airdate' 
      });
      return response.results;
    } catch (error) {
      console.error('Error fetching recent plays:', error);
      return [];
    }
  }

  async getPlayById(id: number): Promise<KexpPlay | null> {
    try {
      return this.makeRequest<KexpPlay>(`/plays/${id}/`);
    } catch (error) {
      console.error(`Error fetching play ${id}:`, error);
      return null;
    }
  }

  async getHostById(id: number): Promise<KexpHost | null> {
    try {
      return this.makeRequest<KexpHost>(`/hosts/${id}/`);
    } catch (error) {
      console.error(`Error fetching host ${id}:`, error);
      return null;
    }
  }

  async getShowById(id: number): Promise<KexpShow | null> {
    try {
      return this.makeRequest<KexpShow>(`/shows/${id}/`);
    } catch (error) {
      console.error(`Error fetching show ${id}:`, error);
      return null;
    }
  }

  async getProgramById(id: number): Promise<KexpProgram | null> {
    try {
      return this.makeRequest<KexpProgram>(`/programs/${id}/`);
    } catch (error) {
      console.error(`Error fetching program ${id}:`, error);
      return null;
    }
  }

  async searchPlays(query: string, limit: number = 10): Promise<KexpPlay[]> {
    try {
      const response = await this.getPlays({ 
        limit, 
        search: query,
        ordering: '-airdate' 
      });
      return response.results;
    } catch (error) {
      console.error('Error searching plays:', error);
      return [];
    }
  }
}