import { t } from '../i18n';
import type { ApiEnvelope, ListEnvelope, PaginatedData } from '../types/api';
import type {
  ArtistVariant,
  PerformanceDetail,
  Prediction,
  PredictionDraftItem,
  SingleSongPredictionItem,
  SongItem,
  TopSongItem,
  TourListItem,
} from '../types/domain';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

const ERROR_MESSAGE_KEY_BY_CODE: Record<string, string> = {
  INVALID_JSON: 'errors.INVALID_JSON',
  INVALID_NICKNAME: 'errors.INVALID_NICKNAME',
  INVALID_DESCRIPTION: 'errors.INVALID_DESCRIPTION',
  INVALID_ITEMS: 'errors.INVALID_ITEMS',
  INVALID_PREDICTION_ID: 'errors.INVALID_PREDICTION_ID',
  TOUR_NOT_FOUND: 'errors.TOUR_NOT_FOUND',
  PERFORMANCE_NOT_FOUND: 'errors.PERFORMANCE_NOT_FOUND',
  PERFORMANCE_NOT_IN_TOUR: 'errors.PERFORMANCE_NOT_IN_TOUR',
  SUBMISSION_CLOSED: 'errors.SUBMISSION_CLOSED',
  PREDICTION_NOT_FOUND: 'errors.PREDICTION_NOT_FOUND',
  FORBIDDEN: 'errors.FORBIDDEN',
  DB_WRITE_FAILED: 'errors.DB_WRITE_FAILED',
};

export class ApiRequestError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 20000;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      let message = text;
      let code: string | undefined;
      try {
        const parsed = JSON.parse(text) as ApiErrorPayload;
        code = parsed.error?.code;
        if (parsed.error?.message) {
          message = parsed.error.message;
        }
      } catch {
        // ignore JSON parse failure and keep plain text
      }

      const friendlyMessage = code
        ? t(ERROR_MESSAGE_KEY_BY_CODE[code] ?? 'errors.REQUEST_FAILED', { status: response.status })
        : message;
      throw new ApiRequestError(
        friendlyMessage || t('errors.REQUEST_FAILED', { status: response.status }),
        response.status,
        code,
      );
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiRequestError(t('errors.REQUEST_TIMEOUT'), 408, 'REQUEST_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface CreatePredictionPayload {
  tourId: string;
  performanceId: string;
  nickname: string;
  description?: string;
  items: PredictionDraftItem[];
}

export interface QueryListPayload {
  page?: number;
  pageSize?: number;
  seriesIds?: string[];
}

export interface SearchSongsPayload extends QueryListPayload {
  search: string;
  seriesIds: string[];
}

export interface NominateSongPayload {
  tourId: string;
  songId: string;
}

export interface VoteSingleSongPayload {
  tourId: string;
  songId: string;
  vote: 'will_sing' | 'wont_sing';
}

export interface DeleteSingleSongVotePayload {
  tourId: string;
  songId: string;
}

export const api = {
  async getTourDetail(tourId: string): Promise<ApiEnvelope<TourListItem>> {
    return request(`/ll-fans/tours/${tourId}`);
  },

  async getTours(payload: QueryListPayload): Promise<PaginatedData<TourListItem>> {
    return request('/ll-fans/tours', { method: 'POST', body: payload });
  },

  async searchSongs(payload: SearchSongsPayload): Promise<ListEnvelope<SongItem>> {
    return request('/ll-fans/search-songs', { method: 'POST', body: payload });
  },

  async getArtistVariants(): Promise<ApiEnvelope<{ items: ArtistVariant[] }>> {
    return request('/ll-fans/artist-variants');
  },

  async getPerformanceDetail(performanceId: string): Promise<ApiEnvelope<PerformanceDetail>> {
    return request(`/ll-fans/performances/${performanceId}`);
  },

  async refreshPerformanceDetail(performanceId: string): Promise<ApiEnvelope<PerformanceDetail>> {
    return request(`/ll-fans/performances/${performanceId}/refresh`, { method: 'POST' });
  },

  async createPrediction(payload: CreatePredictionPayload): Promise<ApiEnvelope<{ id: number }>> {
    const sanitizedItems = payload.items.map((item) => {
      if (item.type === 'song') {
        return {
          type: 'song' as const,
          songId: item.songId,
          note: item.note,
        };
      }

      return {
        type: 'text' as const,
        text: item.text,
        note: item.note,
      };
    });

    return request('/predictions', {
      method: 'POST',
      body: {
        ...payload,
        items: sanitizedItems,
      },
    });
  },

  async deletePrediction(id: string | number): Promise<ApiEnvelope<{ ok: true }>> {
    return request(`/predictions/${id}`, { method: 'DELETE' });
  },

  async getPrediction(id: string | number): Promise<ApiEnvelope<Prediction>> {
    return request(`/predictions/${id}`);
  },

  async getPredictionLikes(
    id: string | number,
  ): Promise<ApiEnvelope<{ likes: number; likedByMe: boolean }>> {
    return request(`/predictions/${id}/likes`);
  },

  async getTourPredictions(
    tourId: string,
    params: {
      page?: number;
      pageSize?: number;
      performanceId?: string;
      sort?: 'likes' | 'created_at' | 'song_accuracy' | 'order_accuracy';
      songId?: string;
    },
  ): Promise<ListEnvelope<Prediction>> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.performanceId) query.set('performanceId', params.performanceId);
    if (params.sort) query.set('sort', params.sort);
    if (params.songId) query.set('songId', params.songId);
    return request(`/tours/${tourId}/predictions?${query.toString()}`);
  },

  async getAllPredictions(params: {
    page?: number;
    pageSize?: number;
    tourId?: string;
    performanceId?: string;
    hasSetlist?: boolean;
    mine?: boolean;
    sort?: 'created_at' | 'likes' | 'song_accuracy' | 'order_accuracy';
  }): Promise<ListEnvelope<Prediction>> {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.tourId) query.set('tourId', params.tourId);
    if (params.performanceId) query.set('performanceId', params.performanceId);
    if (params.hasSetlist !== undefined) query.set('hasSetlist', String(params.hasSetlist));
    if (params.mine) query.set('mine', '1');
    if (params.sort) query.set('sort', params.sort);
    return request(`/predictions?${query.toString()}`);
  },

  async likePrediction(
    id: string | number,
  ): Promise<ApiEnvelope<{ likes: number; likedByMe: true }>> {
    return request(`/predictions/${id}/like`, { method: 'POST' });
  },

  async unlikePrediction(
    id: string | number,
  ): Promise<ApiEnvelope<{ likes: number; likedByMe: false }>> {
    return request(`/predictions/${id}/like`, { method: 'DELETE' });
  },

  async getTopSongs(performanceId: string): Promise<ApiEnvelope<{ items: TopSongItem[] }>> {
    return request(`/performances/${performanceId}/top-songs`);
  },

  async getSingleSongPredictions(
    performanceId: string,
  ): Promise<ApiEnvelope<{ items: SingleSongPredictionItem[] }>> {
    return request(`/performances/${performanceId}/song-predictions`);
  },

  async nominateSong(
    performanceId: string,
    payload: NominateSongPayload,
  ): Promise<ApiEnvelope<{ ok: true }>> {
    return request(`/performances/${performanceId}/song-predictions/nominate`, {
      method: 'POST',
      body: payload,
    });
  },

  async voteSingleSong(
    performanceId: string,
    payload: VoteSingleSongPayload,
  ): Promise<ApiEnvelope<{ ok: true }>> {
    return request(`/performances/${performanceId}/song-predictions/vote`, {
      method: 'POST',
      body: payload,
    });
  },

  async deleteSingleSongVote(
    performanceId: string,
    payload: DeleteSingleSongVotePayload,
  ): Promise<ApiEnvelope<{ ok: true }>> {
    return request(`/performances/${performanceId}/song-predictions/vote`, {
      method: 'DELETE',
      body: payload,
    });
  },
};
