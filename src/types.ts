export interface KexpPlay {
  id: number;
  uri: string;
  airdate: string;
  show: number;
  show_uri: string;
  image_uri?: string;
  thumbnail_uri?: string;
  song: string;
  track_id?: string;
  recording_id?: string;
  artist: string;
  artist_ids?: string[];
  album?: string;
  release_id?: string;
  release_group_id?: string;
  labels?: string[];
  label_ids?: string[];
  release_date?: string;
  rotation_status?: string;
  is_local: boolean;
  is_request: boolean;
  is_live: boolean;
  comment?: string;
  location: number;
  location_name: string;
  play_type: string;
}

export interface KexpHost {
  id: number;
  uri: string;
  name: string;
  image_uri?: string;
  thumbnail_uri?: string;
  is_active: boolean;
  location: number;
}

export interface KexpShow {
  id: number;
  uri: string;
  program: number;
  program_uri: string;
  hosts: number[];
  host_uris: string[];
  program_name: string;
  program_tags?: string;
  host_names: string[];
  tagline?: string;
  image_uri?: string;
  program_image_uri?: string;
  start_time: string;
  location: number;
  location_name: string;
}

export interface KexpProgram {
  id: number;
  uri: string;
  name: string;
  host_names?: string[];
  hosts?: number[];
  host_uris?: string[];
  tagline?: string;
  description?: string;
  tags?: string;
  image_uri?: string;
  thumbnail_uri?: string;
  is_active: boolean;
  location: number;
  location_name?: string;
}

export interface KexpTimeslot {
  id: number;
  uri: string;
  program: number;
  program_uri: string;
  program_name: string;
  program_tags?: string;
  start_time: string;
  end_time: string;
  weekday: number;
  location: number;
  location_name: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface KexpApiClient {
  getPlays(params?: QueryParams): Promise<PaginatedResponse<KexpPlay>>;
  getHosts(params?: QueryParams): Promise<PaginatedResponse<KexpHost>>;
  getShows(params?: QueryParams): Promise<PaginatedResponse<KexpShow>>;
  getPrograms(params?: QueryParams): Promise<PaginatedResponse<KexpProgram>>;
  getTimeslots(params?: QueryParams): Promise<PaginatedResponse<KexpTimeslot>>;
  getCurrentPlay(): Promise<KexpPlay | null>;
  getRecentPlays(limit?: number): Promise<KexpPlay[]>;
}

export interface QueryParams {
  limit?: number;
  offset?: number;
  ordering?: string;
  [key: string]: any;
}