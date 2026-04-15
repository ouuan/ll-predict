import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { fromError } from 'zod-validation-error';

interface D1PreparedStatement {
  bind: (...values: unknown[]) => {
    first: <T>() => Promise<T | null>;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    all: <T>() => Promise<{ results: T[] }>;
    run: () => Promise<unknown>;
  };
}

interface D1LikeDatabase {
  prepare: (query: string) => D1PreparedStatement;
}

interface AppBindings {
  DB: D1LikeDatabase;
}

const app = new Hono<{ Bindings: AppBindings }>();
const LLFANS_GRAPHQL_ENDPOINT = 'https://api.ll-fans.jp/graphql';
const PERFORMANCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const SESSION_COOKIE = 'll-predict-session';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestSessionIds = new WeakMap<Context, string>();

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.coerce.number().int().positive();
const predictionIdSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value > 0, {
    message: 'Prediction id must be a positive safe integer.',
  });

const idParamSchema = z.object({
  id: nonEmptyStringSchema,
});

const tourIdParamSchema = z.object({
  tourId: nonEmptyStringSchema,
});

const performanceIdParamSchema = z.object({
  performanceId: nonEmptyStringSchema,
});

const predictionIdParamSchema = z.object({
  id: predictionIdSchema,
});

const listToursBodySchema = z.object({
  page: positiveIntegerSchema.optional(),
  pageSize: positiveIntegerSchema.optional(),
  seriesIds: z.array(nonEmptyStringSchema).optional(),
});

const searchSongsBodySchema = z.object({
  search: z.string().optional(),
  seriesIds: z.array(nonEmptyStringSchema).optional(),
  page: positiveIntegerSchema.optional(),
  pageSize: positiveIntegerSchema.optional(),
});

const predictionItemBaseSchema = z.object({
  note: z.string().max(100).optional(),
});

const predictionSongItemSchema = predictionItemBaseSchema.extend({
  type: z.literal('song'),
  songId: nonEmptyStringSchema,
});

const predictionTextItemSchema = predictionItemBaseSchema.extend({
  type: z.literal('text'),
  text: z.string().trim().min(1)
    .max(200),
});

const predictionDraftItemSchema = z.discriminatedUnion('type', [
  predictionSongItemSchema,
  predictionTextItemSchema,
]);

const createPredictionBodySchema = z.object({
  tourId: nonEmptyStringSchema,
  performanceId: nonEmptyStringSchema,
  nickname: z.string().min(1).max(50),
  description: z.string().max(1000).optional(),
  items: z.array(predictionDraftItemSchema).min(1).max(100),
});

const listTourPredictionsQuerySchema = z.object({
  page: positiveIntegerSchema.optional(),
  pageSize: positiveIntegerSchema.optional(),
  performanceId: z.string().optional(),
  sort: z.enum(['created_at', 'likes', 'song_accuracy', 'order_accuracy']).optional(),
  songId: z.string().optional(),
});

const listPredictionsQuerySchema = z.object({
  page: positiveIntegerSchema.optional(),
  pageSize: positiveIntegerSchema.optional(),
  sort: z.enum(['created_at', 'likes', 'song_accuracy', 'order_accuracy']).optional(),
  tourId: z.string().optional(),
  performanceId: z.string().optional(),
  mine: z.enum(['0', '1']).optional(),
  hasSetlist: z.enum(['true', 'false']).optional(),
});

const nominateSongBodySchema = z.object({
  tourId: nonEmptyStringSchema,
  songId: nonEmptyStringSchema,
});

const voteSingleSongBodySchema = z.object({
  tourId: nonEmptyStringSchema,
  songId: nonEmptyStringSchema,
  vote: z.enum(['will_sing', 'wont_sing']),
});

const deleteSingleSongVoteBodySchema = z.object({
  tourId: nonEmptyStringSchema,
  songId: nonEmptyStringSchema,
});

interface Venue {
  id: string;
  name: string;
}

interface PerformanceSummary {
  id: string;
  name: string;
  predictionsCount: number;
  songNominationsCount: number;
}

interface Concert {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  venue: Venue;
  performances: PerformanceSummary[];
}

interface Tour {
  id: string;
  name: string;
  seriesIds: string[];
  startsOn: string;
  endsOn: string;
  performanceCount: number;
  predictionsCount: number;
  concerts: Concert[];
}

interface SetlistItem {
  id: string;
  indexPrefix: string;
  indexNumber: number | null;
  contentType: 'song' | 'other';
  song: { id: string; name: string; seriesIds: string[] } | null;
  contentTypeOther: string | null;
  note: string | null;
  premiere: boolean;
}

interface PerformanceDetail {
  id: string;
  setlists: SetlistItem[];
  startsAt: string | null;
}

interface CachedPerformanceDetail {
  detail: PerformanceDetail;
  fetchedAt: number;
}

interface PerformanceCacheDbRow {
  performance_id: string;
  performance_data: string;
  fetched_at: string;
}

interface LlFansGraphqlEnvelope<T> {
  data?: T;
  errors?: {
    message?: string;
  }[];
}

interface LlFansTourListResponse {
  tours?: {
    paginatorInfo?: {
      total?: number;
    };
    data?: {
      id: string | number;
      name?: string;
      seriesIds?: (string | number)[];
      startsOn?: string;
      endsOn?: string;
    }[];
  };
}

interface LlFansTourDetailResponse {
  tour?: {
    id: string | number;
    name?: string;
    seriesIds?: (string | number)[];
    startsOn?: string;
    endsOn?: string;
    concerts?: {
      id: string | number;
      name?: string;
      startsOn?: string;
      endsOn?: string;
      venue?: {
        id: string | number;
        name?: string;
      } | null;
      performances?: {
        id: string | number;
        name?: string;
      }[];
    }[];
  };
}

interface LlFansSongListResponse {
  songs?: {
    paginatorInfo?: {
      currentPage?: number;
      hasMorePages?: boolean;
      total?: number;
    };
    data?: {
      id: string | number;
      name?: string;
      seriesIds?: (string | number)[];
      releasedOn?: string | null;
      artistVariants?: { id: string | number }[] | null;
    }[];
  };
}

interface LlFansArtistVariantsResponse {
  artistVariants?: {
    id: string | number;
    displayName?: string | null;
  }[];
}

interface LlFansPerformanceDetailResponse {
  performance?: {
    id: string | number;
    date?: string | null;
    startTime?: string | null;
    setlists?: {
      id: string | number;
      indexPrefix?: string;
      indexNumber?: number | null;
      contentTypeOther?: string | null;
      note?: string | null;
      premiere?: boolean;
      content?: {
        __typename?: string;
        id?: string | number;
        name?: string;
        seriesIds?: (string | number)[];
      } | null;
    }[];
  };
}

interface LlFansPerformanceNameResponse {
  performance?: {
    id: string | number;
    name?: string | null;
  } | null;
}

interface LlFansSongNameResponse {
  song?: {
    id: string | number;
    name?: string | null;
  } | null;
}

interface PredictionDraftItem {
  type: 'song' | 'text';
  songId?: string;
  songName?: string;
  text?: string;
  note?: string;
}

interface Prediction {
  id: number;
  tourId: string;
  concertId: string;
  performanceId: string;
  performanceName: string;
  performanceTitle: string;
  nickname: string;
  description: string | null;
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  songAccuracy: number | null;
  orderAccuracy: number | null;
  sessionId: string;
  items: PredictionDraftItem[];
}

interface NameCacheDbRow {
  id: string;
  name: string;
}

const tourCache = new Map<string, Tour>();

const performanceDetails = new Map<string, CachedPerformanceDetail>();

function isPerformanceCacheFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt <= PERFORMANCE_CACHE_TTL_MS;
}

function setPerformanceDetailCache(detail: PerformanceDetail, fetchedAt = Date.now()) {
  performanceDetails.set(detail.id, { detail, fetchedAt });
}

function hasPerformanceStarted(detail: PerformanceDetail): boolean {
  if (!detail.startsAt) {
    return false;
  }

  const startedAt = Date.parse(detail.startsAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }

  return Date.now() >= startedAt;
}

function shouldUseCachedPerformanceDetail(detail: PerformanceDetail, fetchedAt: number): boolean {
  if (!isPerformanceCacheFresh(fetchedAt)) {
    return false;
  }

  if (detail.setlists.length > 0) {
    return true;
  }

  return !hasPerformanceStarted(detail);
}

function getFreshPerformanceDetailFromMemory(performanceId: string): PerformanceDetail | null {
  const cached = performanceDetails.get(performanceId);
  if (!cached) {
    return null;
  }

  if (!shouldUseCachedPerformanceDetail(cached.detail, cached.fetchedAt)) {
    performanceDetails.delete(performanceId);
    return null;
  }

  return cached.detail;
}

function getPerformanceSetlistsFromMemory(performanceId: string): SetlistItem[] {
  return getFreshPerformanceDetailFromMemory(performanceId)?.setlists ?? [];
}

function parsePerformanceCacheRow(row: PerformanceCacheDbRow): CachedPerformanceDetail | null {
  const fetchedAt = Date.parse(row.fetched_at);
  if (!Number.isFinite(fetchedAt)) {
    return null;
  }

  try {
    const detail = JSON.parse(row.performance_data);
    if (!detail || typeof detail !== 'object' || !Array.isArray(detail.setlists)) {
      return null;
    }

    const normalized: PerformanceDetail = {
      id: typeof detail.id === 'string' ? detail.id : row.performance_id,
      setlists: detail.setlists,
      startsAt: typeof detail.startsAt === 'string' ? detail.startsAt : null,
    };

    if (!shouldUseCachedPerformanceDetail(normalized, fetchedAt)) {
      return null;
    }

    return {
      detail: normalized,
      fetchedAt,
    };
  } catch {
    return null;
  }
}

async function loadPerformanceNameCacheMap(
  db: D1LikeDatabase,
  performanceIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (performanceIds.length === 0) {
    return result;
  }

  const placeholders = performanceIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `
      SELECT performance_id AS id, name
      FROM performance_names
      WHERE performance_id IN (${placeholders})
    `,
  ).bind(...performanceIds).all<NameCacheDbRow>();

  for (const row of rows.results) {
    result.set(row.id, row.name);
  }

  return result;
}

async function loadSongNameCacheMap(
  db: D1LikeDatabase,
  songIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (songIds.length === 0) {
    return result;
  }

  const placeholders = songIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `
      SELECT song_id AS id, name
      FROM song_names
      WHERE song_id IN (${placeholders})
    `,
  ).bind(...songIds).all<NameCacheDbRow>();

  for (const row of rows.results) {
    result.set(row.id, row.name);
  }

  return result;
}

async function upsertPerformanceName(
  db: D1LikeDatabase,
  performanceId: string,
  name: string,
) {
  await db.prepare(
    `
      INSERT INTO performance_names (performance_id, name)
      VALUES (?, ?)
      ON CONFLICT(performance_id) DO UPDATE SET
        name = excluded.name
      WHERE performance_names.name <> excluded.name
    `,
  ).bind(performanceId, name).run();
}

async function upsertSongName(
  db: D1LikeDatabase,
  songId: string,
  name: string,
) {
  await db.prepare(
    `
      INSERT INTO song_names (song_id, name)
      VALUES (?, ?)
      ON CONFLICT(song_id) DO UPDATE SET
        name = excluded.name
      WHERE song_names.name <> excluded.name
    `,
  ).bind(songId, name).run();
}

async function upsertPerformanceNamesFromTour(db: D1LikeDatabase, tour: Tour) {
  const entries = tour.concerts.flatMap((concert) => {
    return concert.performances
      .map((performance) => ({ id: performance.id, name: performance.name.trim() }))
      .filter((item) => item.id && item.name);
  });

  await Promise.all(entries.map((entry) => {
    return upsertPerformanceName(db, entry.id, entry.name);
  }));
}

async function upsertSongNamesFromSetlists(db: D1LikeDatabase, setlists: SetlistItem[]) {
  const map = new Map<string, string>();
  for (const setlist of setlists) {
    if (setlist.contentType !== 'song' || !setlist.song) {
      continue;
    }

    const name = setlist.song.name.trim();
    if (!name) {
      continue;
    }
    map.set(setlist.song.id, name);
  }

  await Promise.all([...map.entries()].map(([songId, name]) => {
    return upsertSongName(db, songId, name);
  }));
}

async function resolvePerformanceNameMap(
  db: D1LikeDatabase,
  performanceIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(performanceIds)].filter(Boolean);
  const result = new Map<string, string>();
  if (uniqueIds.length === 0) {
    return result;
  }

  const cacheMap = await loadPerformanceNameCacheMap(db, uniqueIds);
  const idsToRefresh: string[] = [];

  for (const performanceId of uniqueIds) {
    const cached = cacheMap.get(performanceId);
    if (!cached) {
      idsToRefresh.push(performanceId);
      continue;
    }

    result.set(performanceId, cached);
  }

  if (idsToRefresh.length === 0) {
    return result;
  }

  await Promise.all(idsToRefresh.map(async (performanceId) => {
    try {
      const freshName = await fetchPerformanceNameFromLlFans(performanceId);
      if (!freshName) {
        return;
      }

      result.set(performanceId, freshName);
      await upsertPerformanceName(db, performanceId, freshName);
    } catch {
      // Keep stale value when refresh fails.
    }
  }));

  return result;
}

async function resolveSongNameMap(
  db: D1LikeDatabase,
  songIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(songIds)].filter(Boolean);
  const result = new Map<string, string>();
  if (uniqueIds.length === 0) {
    return result;
  }

  const cacheMap = await loadSongNameCacheMap(db, uniqueIds);
  const idsToRefresh: string[] = [];

  for (const songId of uniqueIds) {
    const cached = cacheMap.get(songId);
    if (!cached) {
      idsToRefresh.push(songId);
      continue;
    }

    result.set(songId, cached);
  }

  if (idsToRefresh.length === 0) {
    return result;
  }

  await Promise.all(idsToRefresh.map(async (songId) => {
    try {
      const freshName = await fetchSongNameFromLlFans(songId);
      if (!freshName) {
        return;
      }

      result.set(songId, freshName);
      await upsertSongName(db, songId, freshName);
    } catch {
      // Keep stale value when refresh fails.
    }
  }));

  return result;
}

async function getFreshPerformanceDetailFromDb(
  db: D1LikeDatabase,
  performanceId: string,
): Promise<PerformanceDetail | null> {
  const row = await db.prepare(
    'SELECT performance_id, performance_data, fetched_at FROM performance_cache'
    + ' WHERE performance_id = ?',
  ).bind(performanceId).first<PerformanceCacheDbRow>();

  if (!row) {
    return null;
  }

  const parsed = parsePerformanceCacheRow(row);
  if (!parsed) {
    return null;
  }

  setPerformanceDetailCache(parsed.detail, parsed.fetchedAt);
  return parsed.detail;
}

async function writePerformanceDetailToDb(
  db: D1LikeDatabase,
  detail: PerformanceDetail,
  fetchedAt: string,
) {
  await db.prepare(
    `
      INSERT INTO performance_cache (performance_id, performance_data, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(performance_id) DO UPDATE SET
        performance_data = excluded.performance_data,
        fetched_at = excluded.fetched_at
    `,
  ).bind(detail.id, JSON.stringify(detail), fetchedAt).run();
}

async function warmPerformanceDetailsCache(
  db: D1LikeDatabase,
  performanceIds: string[],
) {
  if (performanceIds.length === 0) {
    return;
  }

  const missingIds = [...new Set(performanceIds)].filter(
    (performanceId) => !getFreshPerformanceDetailFromMemory(performanceId),
  );
  if (missingIds.length === 0) {
    return;
  }

  const stillMissingIds = (await Promise.all(missingIds.map(async (performanceId) => {
    const persisted = await getFreshPerformanceDetailFromDb(db, performanceId);
    return persisted ? null : performanceId;
  }))).filter((performanceId): performanceId is string => Boolean(performanceId));

  if (stillMissingIds.length === 0) {
    return;
  }

  await Promise.all(stillMissingIds.map(async (performanceId) => {
    try {
      await getPerformanceDetail(performanceId, true, db);
    } catch {
      // Listing endpoints should remain available even when ll-fans is unavailable.
    }
  }));
}

async function llFansGraphqlRequest<T>(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(LLFANS_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operationName,
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`ll-fans GraphQL request failed with status ${response.status}.`);
  }

  const envelope = await response.json() as LlFansGraphqlEnvelope<T>;
  if (envelope.errors && envelope.errors.length > 0) {
    const message = envelope.errors
      .map((error) => error.message)
      .filter((item): item is string => Boolean(item))
      .join('; ');
    throw new Error(message || 'll-fans GraphQL returned errors.');
  }

  if (!envelope.data) {
    throw new Error('ll-fans GraphQL response does not contain data.');
  }

  return envelope.data;
}

function toStringId(value: string | number | undefined): string {
  return String(value ?? '');
}

function toStringArray(values: (string | number)[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return values.map((value) => String(value));
}

function mapTourDetailToTour(tourDetail: NonNullable<LlFansTourDetailResponse['tour']>): Tour {
  const concerts = (tourDetail.concerts ?? []).map((concert) => ({
    id: toStringId(concert.id),
    name: concert.name ?? '',
    startsOn: concert.startsOn ?? '',
    endsOn: concert.endsOn ?? '',
    venue: {
      id: toStringId(concert.venue?.id ?? ''),
      name: concert.venue?.name ?? '',
    },
    performances: (concert.performances ?? []).map((performance) => ({
      id: toStringId(performance.id),
      name: performance.name ?? '',
      predictionsCount: 0,
      songNominationsCount: 0,
    })),
  }));

  const performanceCount = concerts.reduce(
    (count, concert) => count + concert.performances.length,
    0,
  );

  return {
    id: toStringId(tourDetail.id),
    name: tourDetail.name ?? '',
    seriesIds: toStringArray(tourDetail.seriesIds),
    startsOn: tourDetail.startsOn ?? '',
    endsOn: tourDetail.endsOn ?? '',
    performanceCount,
    predictionsCount: 0,
    concerts,
  };
}

async function fetchTourByIdFromLlFans(tourId: string): Promise<Tour | null> {
  const query = `
    query EventDetailPage($id: ID!) {
      tour(id: $id) {
        id
        name
        seriesIds
        startsOn
        endsOn
        concerts(orderBy: [{column: STARTS_ON, order: ASC}]) {
          id
          name
          startsOn
          endsOn
          venue {
            id
            name
          }
          performances(orderBy: [{column: DATE, order: ASC}, {column: START_TIME, order: ASC}]) {
            id
            name
          }
        }
      }
    }
  `;

  const data = await llFansGraphqlRequest<LlFansTourDetailResponse>(
    'EventDetailPage',
    query,
    { id: tourId },
  );

  if (!data.tour) {
    return null;
  }

  const mapped = mapTourDetailToTour(data.tour);
  tourCache.set(mapped.id, mapped);
  return mapped;
}

async function getTourById(tourId: string): Promise<Tour | null> {
  const cached = tourCache.get(tourId);
  if (cached) {
    return cached;
  }
  return fetchTourByIdFromLlFans(tourId);
}

async function fetchTourSummariesFromLlFans(params?: {
  seriesIds?: string[];
}): Promise<{ total: number; items: Tour[] }> {
  const query = `
    query EventListPage($filter: TourFilterInput, $orderBy: [QueryToursOrderByOrderByClause!]) {
      tours(filter: $filter, orderBy: $orderBy) {
        paginatorInfo {
          total
        }
        data {
          id
          name
          seriesIds
          startsOn
          endsOn
        }
      }
    }
  `;

  const filter: Record<string, unknown> = {};
  if ((params?.seriesIds?.length ?? 0) > 0) {
    filter.seriesIds = params?.seriesIds;
  }

  const data = await llFansGraphqlRequest<LlFansTourListResponse>(
    'EventListPage',
    query,
    {
      filter,
      orderBy: [{ column: 'STARTS_ON', order: 'DESC' }],
    },
  );

  const items = (data.tours?.data ?? []).map((tour) => ({
    id: toStringId(tour.id),
    name: tour.name ?? '',
    seriesIds: toStringArray(tour.seriesIds),
    startsOn: tour.startsOn ?? '',
    endsOn: tour.endsOn ?? '',
    performanceCount: 0,
    predictionsCount: 0,
    concerts: [],
  }));

  return {
    total: data.tours?.paginatorInfo?.total ?? items.length,
    items,
  };
}

async function fetchSongsFromLlFans(params: {
  search: string;
  seriesIds: string[];
  page: number;
  pageSize: number;
}) {
  const query = `
    query SongListPage(
      $filter: SongFilterInput!
      $orderBy: [QuerySongsOrderByOrderByClause!]!
      $page: Int!
      $first: Int!
    ) {
      songs(filter: $filter, orderBy: $orderBy, first: $first, page: $page) {
        paginatorInfo {
          currentPage
          hasMorePages
          total
        }
        data {
          id
          name
          seriesIds
          releasedOn
          artistVariants {
            id
          }
        }
      }
    }
  `;

  const filter: Record<string, unknown> = {
    search: params.search,
  };
  if (params.seriesIds.length > 0) {
    filter.seriesIds = params.seriesIds;
  }

  const data = await llFansGraphqlRequest<LlFansSongListResponse>('SongListPage', query, {
    filter,
    orderBy: [
      { column: 'SORT_RELEASED_ON', order: 'ASC' },
      { column: 'ID', order: 'ASC' },
    ],
    page: params.page,
    first: params.pageSize,
  });

  return {
    items: (data.songs?.data ?? []).map((song) => ({
      id: toStringId(song.id),
      name: song.name ?? '',
      seriesIds: toStringArray(song.seriesIds),
      releasedOn: song.releasedOn ?? null,
      artistVariantIds: (song.artistVariants ?? []).map((v) => toStringId(v.id)),
    })),
    total: data.songs?.paginatorInfo?.total ?? 0,
    page: data.songs?.paginatorInfo?.currentPage ?? params.page,
    hasMore: Boolean(data.songs?.paginatorInfo?.hasMorePages),
  };
}

function mapPerformanceSetlists(
  setlists: NonNullable<LlFansPerformanceDetailResponse['performance']>['setlists'],
): SetlistItem[] {
  return (setlists ?? []).map((setlist) => {
    const contentType = setlist.content?.__typename === 'Song' && setlist.content.id
      ? 'song'
      : 'other';

    const song = contentType === 'song'
      ? {
          id: toStringId(setlist.content?.id),
          name: setlist.content?.name ?? '',
          seriesIds: toStringArray(setlist.content?.seriesIds),
        }
      : null;

    const contentTypeOther = setlist.contentTypeOther
      ?? (
        setlist.content?.__typename === 'CollaborationSong'
          ? (setlist.content.name ?? null)
          : null
      );

    return {
      id: toStringId(setlist.id),
      indexPrefix: setlist.indexPrefix ?? '',
      indexNumber: typeof setlist.indexNumber === 'number' ? setlist.indexNumber : null,
      contentType,
      song,
      contentTypeOther,
      note: setlist.note ?? null,
      premiere: Boolean(setlist.premiere),
    };
  });
}

function buildPerformanceStartsAt(
  date: string | null | undefined,
  startTime: string | null | undefined,
): string | null {
  if (!date) {
    return null;
  }

  const normalizedStartTime = typeof startTime === 'string' && startTime.trim()
    ? startTime.trim()
    : '00:00';
  const candidate = `${date}T${normalizedStartTime}:00+09:00`;
  if (Number.isFinite(Date.parse(candidate))) {
    return candidate;
  }

  const fallback = `${date}T00:00:00+09:00`;
  if (Number.isFinite(Date.parse(fallback))) {
    return fallback;
  }

  return null;
}

async function fetchPerformanceDetailFromLlFans(
  performanceId: string,
): Promise<PerformanceDetail | null> {
  const query = `
    query EventDetailPage_PerformanceDetail($id: ID!) {
      performance(id: $id) {
        id
        date
        startTime
        setlists(orderBy: [{column: ORDER, order: ASC}, {column: ID, order: ASC}]) {
          id
          indexPrefix
          indexNumber
          content {
            __typename
            ... on Song {
              id
              name
              seriesIds
            }
            ... on CollaborationSong {
              name
            }
          }
          contentTypeOther
          note
          premiere
        }
      }
    }
  `;

  const data = await llFansGraphqlRequest<LlFansPerformanceDetailResponse>(
    'EventDetailPage_PerformanceDetail',
    query,
    { id: performanceId },
  );

  if (!data.performance) {
    return null;
  }

  const mapped: PerformanceDetail = {
    id: toStringId(data.performance.id),
    setlists: mapPerformanceSetlists(data.performance.setlists),
    startsAt: buildPerformanceStartsAt(data.performance.date, data.performance.startTime),
  };
  return mapped;
}

async function fetchPerformanceNameFromLlFans(performanceId: string): Promise<string | null> {
  const query = `
    query EventDetailPage_PerformanceName($id: ID!) {
      performance(id: $id) {
        id
        name
      }
    }
  `;

  const data = await llFansGraphqlRequest<LlFansPerformanceNameResponse>(
    'EventDetailPage_PerformanceName',
    query,
    { id: performanceId },
  );

  const name = data.performance?.name?.trim();
  return name || null;
}

async function fetchSongNameFromLlFans(songId: string): Promise<string | null> {
  const query = `
    query SongDetailForName($id: ID!) {
      song(id: $id) {
        id
        name
      }
    }
  `;

  const data = await llFansGraphqlRequest<LlFansSongNameResponse>(
    'SongDetailForName',
    query,
    { id: songId },
  );

  const name = data.song?.name?.trim();
  return name || null;
}

async function getPerformanceDetail(
  performanceId: string,
  forceRefresh: boolean,
  db: D1LikeDatabase,
) {
  if (!forceRefresh) {
    const cached = getFreshPerformanceDetailFromMemory(performanceId);
    if (cached) {
      return cached;
    }

    const persisted = await getFreshPerformanceDetailFromDb(db, performanceId);
    if (persisted) {
      return persisted;
    }
  }

  const detail = await fetchPerformanceDetailFromLlFans(performanceId);
  if (!detail) {
    return null;
  }

  const fetchedAt = Date.now();
  setPerformanceDetailCache(detail, fetchedAt);
  await writePerformanceDetailToDb(db, detail, new Date(fetchedAt).toISOString());
  await upsertSongNamesFromSetlists(db, detail.setlists);
  return detail;
}

interface PredictionDbRow {
  id: number | string;
  tour_id: string;
  concert_id: string;
  performance_id: string;
  nickname: string;
  description: string | null;
  created_at: string;
  session_id: string;
  likes?: number | string;
  liked_by_me?: number | string;
}

interface PredictionItemDbRow {
  prediction_id: number | string;
  item_order: number | string;
  item_type: string;
  song_id: string | null;
  text: string | null;
  note: string | null;
}

interface SingleSongPredictionDbRow {
  song_id: string;
  will_sing_count: number | string;
  wont_sing_count: number | string;
  my_vote: 'will_sing' | 'wont_sing' | null;
}

interface SingleSongPredictionItem {
  songId: string;
  songName: string;
  willSingCount: number;
  wontSingCount: number;
  willSingRatio: number;
  wontSingRatio: number;
  myVote: 'will_sing' | 'wont_sing' | null;
}

function getDatabase(c: Context<{ Bindings: AppBindings }>): D1LikeDatabase {
  return c.env.DB;
}

function rowToPrediction(
  row: PredictionDbRow,
  items: PredictionDraftItem[],
  performanceName: string,
): Prediction {
  return {
    id: Number(row.id),
    tourId: row.tour_id,
    concertId: row.concert_id,
    performanceId: row.performance_id,
    performanceName,
    performanceTitle: buildPerformanceTitle(row.tour_id, row.concert_id, performanceName),
    nickname: row.nickname,
    description: row.description,
    createdAt: row.created_at,
    likes: Number(row.likes ?? 0),
    likedByMe: Number(row.liked_by_me ?? 0) > 0,
    songAccuracy: null,
    orderAccuracy: null,
    sessionId: row.session_id,
    items,
  };
}

async function loadPredictionItemsMap(
  db: D1LikeDatabase,
  predictionIds: number[],
): Promise<Map<number, PredictionDraftItem[]>> {
  const itemsMap = new Map<number, PredictionDraftItem[]>();
  if (predictionIds.length === 0) {
    return itemsMap;
  }

  const placeholders = predictionIds.map(() => '?').join(',');
  const rows = await db.prepare(
    `
      SELECT
        prediction_id,
        item_order,
        item_type,
        song_id,
        text,
        note
      FROM prediction_items
      WHERE prediction_id IN (${placeholders})
      ORDER BY prediction_id ASC, item_order ASC
    `,
  ).bind(...predictionIds).all<PredictionItemDbRow>();

  for (const row of rows.results) {
    const predictionId = Number(row.prediction_id);
    if (!Number.isSafeInteger(predictionId)) {
      continue;
    }

    const item: PredictionDraftItem = row.item_type === 'song'
      ? {
          type: 'song',
          songId: row.song_id ?? undefined,
          note: row.note ?? undefined,
        }
      : {
          type: 'text',
          text: row.text ?? undefined,
          note: row.note ?? undefined,
        };

    const existing = itemsMap.get(predictionId);
    if (existing) {
      existing.push(item);
    } else {
      itemsMap.set(predictionId, [item]);
    }
  }

  return itemsMap;
}

async function countPredictionsByTourId(
  db: D1LikeDatabase,
  tourId: string,
): Promise<number> {
  try {
    const result = await db.prepare(
      'SELECT COUNT(*) AS count FROM predictions WHERE tour_id = ?',
    ).bind(tourId).first<{ count: number | string }>();
    return Number(result?.count ?? 0);
  } catch {
    return 0;
  }
}

async function countPredictionsByTourIds(
  db: D1LikeDatabase,
  tourIds: string[],
): Promise<Record<string, number>> {
  if (tourIds.length === 0) {
    return {};
  }

  try {
    const placeholders = tourIds.map(() => '?').join(',');
    const rows = await db.prepare(
      'SELECT tour_id, COUNT(*) AS count FROM predictions'
      + ` WHERE tour_id IN (${placeholders}) GROUP BY tour_id`,
    ).bind(...tourIds).all<{ tour_id: string; count: number | string }>();

    const result: Record<string, number> = {};
    for (const row of rows.results) {
      result[row.tour_id] = Number(row.count);
    }
    return result;
  } catch {
    return {};
  }
}

async function countPredictionsByPerformanceIds(
  db: D1LikeDatabase,
  performanceIds: string[],
): Promise<Record<string, number>> {
  if (performanceIds.length === 0) {
    return {};
  }

  try {
    const placeholders = performanceIds.map(() => '?').join(',');
    const rows = await db.prepare(
      'SELECT performance_id, COUNT(*) AS count FROM predictions'
      + ` WHERE performance_id IN (${placeholders}) GROUP BY performance_id`,
    ).bind(...performanceIds).all<{ performance_id: string; count: number | string }>();

    const result: Record<string, number> = {};
    for (const row of rows.results) {
      result[row.performance_id] = Number(row.count);
    }
    return result;
  } catch {
    return {};
  }
}

async function countSongNominationsByPerformanceIds(
  db: D1LikeDatabase,
  performanceIds: string[],
): Promise<Record<string, number>> {
  if (performanceIds.length === 0) {
    return {};
  }

  try {
    const placeholders = performanceIds.map(() => '?').join(',');
    const rows = await db.prepare(
      'SELECT performance_id, COUNT(*) AS count FROM song_nominations'
      + ` WHERE performance_id IN (${placeholders}) GROUP BY performance_id`,
    ).bind(...performanceIds).all<{ performance_id: string; count: number | string }>();

    const result: Record<string, number> = {};
    for (const row of rows.results) {
      result[row.performance_id] = Number(row.count);
    }
    return result;
  } catch {
    return {};
  }
}

async function listPredictionsFromDb(
  db: D1LikeDatabase,
  whereClause: string,
  whereValues: unknown[],
  sessionId: string,
) {
  const query = `
    SELECT
      p.id,
      p.tour_id,
      p.concert_id,
      p.performance_id,
      p.nickname,
      p.description,
      p.created_at,
      p.session_id,
      (SELECT COUNT(*) FROM likes l WHERE l.prediction_id = p.id) AS likes,
      EXISTS(
        SELECT 1 FROM likes l2
        WHERE l2.prediction_id = p.id AND l2.session_id = ?
      ) AS liked_by_me
    FROM predictions p
    ${whereClause}
  `;

  const rows = await db.prepare(query).bind(sessionId, ...whereValues).all<PredictionDbRow>();
  const predictionIds = rows.results
    .map((row) => Number(row.id))
    .filter((id) => Number.isSafeInteger(id));
  const itemsMap = await loadPredictionItemsMap(db, predictionIds);
  const performanceNameMap = await resolvePerformanceNameMap(
    db,
    rows.results.map((row) => row.performance_id),
  );
  const songIds = [...new Set([...itemsMap.values()].flatMap((items) => {
    return items
      .filter((item): item is PredictionDraftItem & { type: 'song'; songId: string } => {
        return item.type === 'song' && typeof item.songId === 'string';
      })
      .map((item) => item.songId);
  }))];
  const songNameMap = await resolveSongNameMap(db, songIds);

  return rows.results
    .map((row) => {
      const predictionId = Number(row.id);
      const items = (itemsMap.get(predictionId) ?? []).map((item) => {
        if (item.type !== 'song' || !item.songId) {
          return item;
        }

        return {
          ...item,
          songName: songNameMap.get(item.songId) ?? item.songId,
        };
      });

      const performanceName = performanceNameMap.get(row.performance_id) ?? 'Unknown';
      return rowToPrediction(row, items, performanceName);
    });
}

async function upsertSongNomination(
  db: D1LikeDatabase,
  performanceId: string,
  songId: string,
) {
  await db.prepare(
    `
      INSERT INTO song_nominations (
        performance_id,
        song_id
      ) VALUES (?, ?)
      ON CONFLICT(performance_id, song_id) DO NOTHING
    `,
  ).bind(
    performanceId,
    songId,
  ).run();
}

async function upsertSingleSongVote(
  db: D1LikeDatabase,
  performanceId: string,
  songId: string,
  vote: 'will_sing' | 'wont_sing',
  sessionId: string,
) {
  await db.prepare(
    `
      INSERT INTO song_prediction_votes (
        performance_id,
        song_id,
        session_id,
        vote
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(performance_id, song_id, session_id) DO UPDATE SET
        vote = excluded.vote
    `,
  ).bind(
    performanceId,
    songId,
    sessionId,
    vote,
  ).run();
}

function toSingleSongPredictionItem(
  row: SingleSongPredictionDbRow,
  songNameMap: Map<string, string>,
): SingleSongPredictionItem {
  const willSingCount = Number(row.will_sing_count);
  const wontSingCount = Number(row.wont_sing_count);
  const totalVotes = willSingCount + wontSingCount;

  return {
    songId: row.song_id,
    songName: songNameMap.get(row.song_id) ?? row.song_id,
    willSingCount,
    wontSingCount,
    willSingRatio: totalVotes === 0 ? 0 : Math.round((willSingCount / totalVotes) * 10000) / 100,
    wontSingRatio: totalVotes === 0 ? 0 : Math.round((wontSingCount / totalVotes) * 10000) / 100,
    myVote: row.my_vote,
  };
}

async function listSingleSongPredictions(
  db: D1LikeDatabase,
  performanceId: string,
  sessionId: string,
): Promise<SingleSongPredictionItem[]> {
  const rows = await db.prepare(
    `
      SELECT
        n.song_id,
        COALESCE(SUM(CASE WHEN v.vote = 'will_sing' THEN 1 ELSE 0 END), 0) AS will_sing_count,
        COALESCE(SUM(CASE WHEN v.vote = 'wont_sing' THEN 1 ELSE 0 END), 0) AS wont_sing_count,
        MAX(CASE WHEN v.session_id = ? THEN v.vote ELSE NULL END) AS my_vote
      FROM song_nominations n
      LEFT JOIN song_prediction_votes v
        ON v.performance_id = n.performance_id
       AND v.song_id = n.song_id
      WHERE n.performance_id = ?
      GROUP BY n.song_id
      ORDER BY
        will_sing_count DESC,
        wont_sing_count ASC,
        n.song_id ASC
    `,
  ).bind(sessionId, performanceId).all<SingleSongPredictionDbRow>();

  const songNameMap = await resolveSongNameMap(
    db,
    rows.results.map((row) => row.song_id),
  );
  return rows.results.map((row) => toSingleSongPredictionItem(row, songNameMap));
}

function jsonError(code: string, message: string, status: number, details?: unknown) {
  return new Response(
    JSON.stringify({
      error: { code, message, details },
    }),
    {
      status,
      headers: {
        'content-type': 'application/json',
      },
    },
  );
}

function formatValidationError(error: z.ZodError): string {
  return fromError(error).message;
}

function validateValue<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): { success: true; data: z.output<TSchema> } | { success: false; response: Response } {
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      success: false,
      response: jsonError(
        'INVALID_PARAMS',
        formatValidationError(result.error),
        400,
        z.treeifyError(result.error),
      ),
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

async function readJsonBody(
  c: Context,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    const data = await c.req.json<unknown>();
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: jsonError('INVALID_JSON', 'Request body must be valid JSON.', 400),
    };
  }
}

function getSessionId(c: Context): string {
  const cachedSessionId = requestSessionIds.get(c);
  if (cachedSessionId) {
    return cachedSessionId;
  }

  const cookieValue = getCookie(c, SESSION_COOKIE);
  const sessionId = cookieValue && UUID_RE.test(cookieValue)
    ? cookieValue
    : crypto.randomUUID();

  // Refresh cookie lifetime on every request (sliding expiration).
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: true,
    maxAge: 3600 * 24 * 365,
  });
  requestSessionIds.set(c, sessionId);
  return sessionId;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 10;
  const start = (safePage - 1) * safePageSize;
  const sliced = items.slice(start, start + safePageSize);
  return {
    items: sliced,
    total: items.length,
    page: safePage,
    pageSize: safePageSize,
    hasMore: start + safePageSize < items.length,
  };
}

function buildPerformanceTitle(
  tourId: string,
  concertId: string,
  performanceName: string,
): string {
  const tour = tourCache.get(tourId);
  const concert = tour?.concerts.find((item) => item.id === concertId);
  const tourName = tour?.name ?? 'Unknown Tour';
  const concertName = concert?.name ?? 'Unknown Concert';
  return `${tourName} ${concertName} ${performanceName}`;
}

function toPredictionResponse(prediction: Prediction, sessionId: string) {
  const predictionWithAccuracy = withComputedAccuracy(prediction);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sessionId: _sessionId, ...rest } = predictionWithAccuracy;

  return {
    ...rest,
    performanceTitle: buildPerformanceTitle(
      predictionWithAccuracy.tourId,
      predictionWithAccuracy.concertId,
      predictionWithAccuracy.performanceName,
    ),
    likedByMe: predictionWithAccuracy.likedByMe,
    isOwner: predictionWithAccuracy.sessionId === sessionId,
    tourStartsOn: tourCache.get(predictionWithAccuracy.tourId)?.startsOn ?? null,
    hasSetlist: getPerformanceSetlistsFromMemory(predictionWithAccuracy.performanceId).length > 0,
  };
}

function withComputedAccuracy(prediction: Prediction): Prediction {
  const setlists = getPerformanceSetlistsFromMemory(prediction.performanceId);
  if (setlists.length === 0) {
    return {
      ...prediction,
      songAccuracy: null,
      orderAccuracy: null,
    };
  }

  const accuracy = computePredictionAccuracy(prediction.items, setlists);
  return {
    ...prediction,
    songAccuracy: accuracy.songAccuracy,
    orderAccuracy: accuracy.orderAccuracy,
  };
}

function toPredictionSongSequence(items: PredictionDraftItem[]): string[] {
  return items
    .filter((item) => item.type === 'song' && item.songId)
    .map((item) => item.songId)
    .filter((songId): songId is string => typeof songId === 'string');
}

function toActualSongSequence(setlists: SetlistItem[]): string[] {
  return setlists
    .filter((item) => item.contentType === 'song' && item.song)
    .map((item) => item.song?.id)
    .filter((songId): songId is string => typeof songId === 'string');
}

function computeEditDistance(a: string[], b: string[]): number {
  const dp: number[][] = Array.from(
    { length: a.length + 1 },
    () => new Array<number>(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) {
    const row = dp[i];
    if (!row) {
      continue;
    }
    row[0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    if (dp[0]) {
      dp[0][j] = j;
    }
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const replaceCost = a[i - 1] === b[j - 1] ? 0 : 1;
      const removeCost = (dp[i - 1]?.[j] ?? 0) + 1;
      const insertCost = (dp[i]?.[j - 1] ?? 0) + 1;
      const replaceValue = (dp[i - 1]?.[j - 1] ?? 0) + replaceCost;
      const row = dp[i];
      if (!row) {
        continue;
      }
      row[j] = Math.min(removeCost, insertCost, replaceValue);
    }
  }

  return dp[a.length]?.[b.length] ?? 0;
}

function computePredictionAccuracy(
  items: PredictionDraftItem[],
  setlists: SetlistItem[],
): { songAccuracy: number; orderAccuracy: number } {
  const predictedSongs = toPredictionSongSequence(items);
  const actualSongs = toActualSongSequence(setlists);

  const predictedCounts = new Map<string, number>();
  predictedSongs.forEach((songId) => {
    predictedCounts.set(songId, (predictedCounts.get(songId) ?? 0) + 1);
  });

  const actualCounts = new Map<string, number>();
  actualSongs.forEach((songId) => {
    actualCounts.set(songId, (actualCounts.get(songId) ?? 0) + 1);
  });

  let overlap = 0;
  predictedCounts.forEach((predictedCount, songId) => {
    overlap += Math.min(predictedCount, actualCounts.get(songId) ?? 0);
  });

  const songDenominator = Math.max(predictedSongs.length, actualSongs.length, 1);
  const songAccuracy = Math.round((overlap / songDenominator) * 10000) / 100;

  const orderDenominator = Math.max(predictedSongs.length, actualSongs.length, 1);
  const distance = computeEditDistance(predictedSongs, actualSongs);
  const orderScore = 1 - distance / orderDenominator;
  const orderAccuracy = Math.max(0, Math.round(orderScore * 10000) / 100);

  return { songAccuracy, orderAccuracy };
}

function isTourSubmissionClosed(tour: Tour): boolean {
  const cutoff = Date.parse(`${tour.startsOn}T00:00:00+09:00`);
  if (!Number.isFinite(cutoff)) {
    return false;
  }
  return Date.now() >= cutoff;
}

function tourHasPerformance(tour: Tour, performanceId: string): boolean {
  return tour.concerts.some((concert) => {
    return concert.performances.some((performance) => performance.id === performanceId);
  });
}

app.use('/api/*', async (c, next) => {
  getSessionId(c);
  await next();
});

app.get('/api/ll-fans/tours/:id', async (c) => {
  const pathValidation = validateValue(idParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const db = getDatabase(c);
  try {
    const tour = await getTourById(id);
    if (!tour) {
      return jsonError('TOUR_NOT_FOUND', `Tour ${id} does not exist.`, 404);
    }
    await upsertPerformanceNamesFromTour(db, tour);
    const predictionsCount = await countPredictionsByTourId(db, tour.id);
    tour.predictionsCount = predictionsCount;

    // Add predictions count for each performance
    const performanceIds = tour.concerts.flatMap((c) =>
      c.performances.map((p) => p.id));
    const performancePredictionsCount = await countPredictionsByPerformanceIds(
      db,
      performanceIds,
    );
    const performanceSongNominationsCount = await countSongNominationsByPerformanceIds(
      db,
      performanceIds,
    );
    for (const concert of tour.concerts) {
      for (const performance of concert.performances) {
        performance.predictionsCount = performancePredictionsCount[performance.id] ?? 0;
        performance.songNominationsCount = performanceSongNominationsCount[performance.id] ?? 0;
      }
    }

    return c.json({ data: tour });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to load tour from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
});

app.post('/api/ll-fans/tours', async (c) => {
  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = validateValue(listToursBodySchema, rawBody.data);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const body = bodyValidation.data;
  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 10;
  const seriesIds = body.seriesIds ?? [];
  const db = getDatabase(c);

  try {
    const summaries = await fetchTourSummariesFromLlFans({ seriesIds });
    const paged = paginate(summaries.items, page, pageSize);
    const predictionsCountByTourId = await countPredictionsByTourIds(
      db,
      paged.items.map((tour) => tour.id),
    );
    const enriched = paged.items.map((tour) => ({
      ...tour,
      predictionsCount: predictionsCountByTourId[tour.id] ?? 0,
    }));

    return c.json({
      data: {
        total: summaries.total,
        items: enriched,
      },
      meta: {
        page: paged.page,
        pageSize: paged.pageSize,
        hasMore: paged.hasMore,
      },
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to load tours from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
});

app.post('/api/ll-fans/search-songs', async (c) => {
  const db = getDatabase(c);
  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = validateValue(searchSongsBodySchema, rawBody.data);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const body = bodyValidation.data;

  const page = body.page ?? 1;
  const pageSize = body.pageSize ?? 10;
  const keyword = (body.search ?? '').trim();
  const seriesIds = (body.seriesIds ?? []);

  try {
    const result = await fetchSongsFromLlFans({
      search: keyword,
      seriesIds,
      page,
      pageSize,
    });

    await Promise.all(result.items
      .filter((song) => song.id && song.name.trim())
      .map((song) => upsertSongName(db, song.id, song.name.trim())));

    return c.json({
      data: {
        items: result.items,
        total: result.total,
      },
      meta: {
        page: result.page,
        pageSize,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to search songs from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
});

app.get('/api/ll-fans/artist-variants', async (c) => {
  const query = `
    query ArtistVariantListContextQuery {
      artistVariants {
        id
        displayName
      }
    }
  `;

  try {
    const data = await llFansGraphqlRequest<LlFansArtistVariantsResponse>(
      'ArtistVariantListContextQuery',
      query,
      {},
    );

    const items = (data.artistVariants ?? []).map((v) => ({
      id: toStringId(v.id),
      displayName: v.displayName ?? '',
    }));

    return c.json({ data: { items } });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to load artist variants from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
});

app.get('/api/ll-fans/performances/:id', async (c) => {
  const pathValidation = validateValue(idParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const db = getDatabase(c);
  let detail: PerformanceDetail | null;
  try {
    detail = await getPerformanceDetail(id, false, db);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to load performance detail from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!detail) {
    return jsonError('PERFORMANCE_NOT_FOUND', `Performance ${id} does not exist.`, 404);
  }
  return c.json({ data: detail });
});

app.post('/api/ll-fans/performances/:id/refresh', async (c) => {
  const pathValidation = validateValue(idParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const db = getDatabase(c);
  let detail: PerformanceDetail | null;
  try {
    detail = await getPerformanceDetail(id, true, db);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to refresh performance detail from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!detail) {
    return jsonError('PERFORMANCE_NOT_FOUND', `Performance ${id} does not exist.`, 404);
  }
  return c.json({ data: detail });
});

app.post('/api/predictions', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = createPredictionBodySchema.safeParse(rawBody.data);
  if (!bodyValidation.success) {
    const firstPath = bodyValidation.error.issues[0]?.path[0];
    let code = 'INVALID_PARAMS';
    if (firstPath === 'nickname') {
      code = 'INVALID_NICKNAME';
    } else if (firstPath === 'description') {
      code = 'INVALID_DESCRIPTION';
    } else if (firstPath === 'items') {
      code = 'INVALID_ITEMS';
    }

    return jsonError(
      code,
      formatValidationError(bodyValidation.error),
      400,
      z.treeifyError(bodyValidation.error),
    );
  }

  const body = bodyValidation.data;

  let tour: Tour | null;
  try {
    tour = await getTourById(body.tourId);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to validate tour from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!tour) {
    return jsonError('TOUR_NOT_FOUND', `Tour ${body.tourId} does not exist.`, 404);
  }
  if (isTourSubmissionClosed(tour)) {
    return jsonError('SUBMISSION_CLOSED', 'Prediction submission is closed for this tour.', 409);
  }

  let concertId = '';
  let performanceName = '';
  tour.concerts.some((concert) => {
    const performance = concert.performances.find((item) => item.id === body.performanceId);
    if (!performance) {
      return false;
    }
    concertId = concert.id;
    performanceName = performance.name;
    return true;
  });

  if (!concertId) {
    return jsonError(
      'PERFORMANCE_NOT_IN_TOUR',
      'Performance does not belong to the provided tour.',
      400,
    );
  }

  const createdAt = new Date().toISOString();
  if (performanceName.trim()) {
    await upsertPerformanceName(db, body.performanceId, performanceName.trim());
  }

  await warmPerformanceDetailsCache(db, [body.performanceId]);
  let createdPredictionId: number | null = null;
  try {
    const insertResult = await db.prepare(
      `
        INSERT INTO predictions (
          tour_id,
          concert_id,
          performance_id,
          nickname,
          description,
          created_at,
          session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).bind(
      body.tourId,
      concertId,
      body.performanceId,
      body.nickname,
      body.description ?? null,
      createdAt,
      sessionId,
    ).run() as { meta?: { last_row_id?: number } };

    const id = insertResult.meta?.last_row_id;
    if (!id) {
      throw new Error('Failed to create prediction row.');
    }
    createdPredictionId = id;

    await Promise.all(body.items.map((item, index) => {
      return db.prepare(
        `
          INSERT INTO prediction_items (
            prediction_id,
            item_order,
            item_type,
            song_id,
            text,
            note
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        id,
        index,
        item.type,
        item.type === 'song' ? item.songId : null,
        item.type === 'text' ? item.text : null,
        item.note ?? null,
      ).run();
    }));

    const uniqueSongIds = new Set<string>();
    body.items.forEach((item) => {
      if (item.type !== 'song' || !item.songId) {
        return;
      }
      uniqueSongIds.add(item.songId);
    });

    await Promise.all([...uniqueSongIds].map((songId) => {
      return upsertSongNomination(db, body.performanceId, songId);
    }));

    await Promise.all([...uniqueSongIds].map((songId) => {
      return upsertSingleSongVote(db, body.performanceId, songId, 'will_sing', sessionId);
    }));

    return c.json({ data: { id } }, 201);
  } catch {
    if (createdPredictionId !== null) {
      try {
        await db.prepare('DELETE FROM predictions WHERE id = ?')
          .bind(createdPredictionId)
          .run();
      } catch {
        // Best-effort cleanup if a later write fails.
      }
    }
    return jsonError('DB_WRITE_FAILED', 'Failed to create prediction.', 500);
  }
});

app.get('/api/predictions/:id', async (c) => {
  const db = getDatabase(c);
  const pathValidation = validateValue(predictionIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const sessionId = getSessionId(c);

  const rows = await listPredictionsFromDb(db, 'WHERE p.id = ?', [id], sessionId);
  const prediction = rows[0];
  await warmPerformanceDetailsCache(db, rows.map((item) => item.performanceId));

  if (!prediction) {
    return jsonError('PREDICTION_NOT_FOUND', `Prediction ${id} does not exist.`, 404);
  }

  // Preload tour to populate tourCache for buildPerformanceTitle
  await getTourById(prediction.tourId);

  return c.json({
    data: toPredictionResponse(prediction, sessionId),
  });
});

app.delete('/api/predictions/:id', async (c) => {
  const db = getDatabase(c);
  const pathValidation = validateValue(predictionIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const sessionId = getSessionId(c);
  const row = await db.prepare(
    'SELECT id, session_id FROM predictions WHERE id = ?',
  ).bind(id).first<{ id: number; session_id: string }>();

  if (!row) {
    return jsonError('PREDICTION_NOT_FOUND', `Prediction ${id} does not exist.`, 404);
  }
  if (row.session_id !== sessionId) {
    return jsonError('FORBIDDEN', 'You can only delete your own prediction.', 403);
  }

  await db.prepare('DELETE FROM likes WHERE prediction_id = ?').bind(id).run();
  await db.prepare('DELETE FROM prediction_items WHERE prediction_id = ?').bind(id).run();
  await db.prepare('DELETE FROM predictions WHERE id = ?').bind(id).run();
  return c.json({ data: { ok: true } });
});

app.get('/api/tours/:tourId/predictions', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(tourIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const queryValidation = validateValue(listTourPredictionsQuerySchema, c.req.query());
  if (!queryValidation.success) {
    return queryValidation.response;
  }

  const { tourId } = pathValidation.data;
  const page = queryValidation.data.page ?? 1;
  const pageSize = queryValidation.data.pageSize ?? 10;
  const performanceId = (queryValidation.data.performanceId ?? '').trim();
  const sort = queryValidation.data.sort ?? 'created_at';
  const songId = (queryValidation.data.songId ?? '').trim();

  const conditions: string[] = ['p.tour_id = ?'];
  const whereValues: unknown[] = [tourId];

  if (performanceId) {
    conditions.push('p.performance_id = ?');
    whereValues.push(performanceId);
  }
  if (songId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM prediction_items pi WHERE pi.prediction_id = p.id AND pi.song_id = ?)',
    );
    whereValues.push(songId);
  }

  let list = await listPredictionsFromDb(
    db,
    `WHERE ${conditions.join(' AND ')}`,
    whereValues,
    sessionId,
  );

  await warmPerformanceDetailsCache(db, list.map((prediction) => prediction.performanceId));

  list = list.map((prediction) => withComputedAccuracy(prediction));

  if (sort === 'likes') {
    list.sort((a, b) => b.likes - a.likes);
  } else if (sort === 'song_accuracy') {
    list.sort((a, b) => (b.songAccuracy ?? -1) - (a.songAccuracy ?? -1));
  } else if (sort === 'order_accuracy') {
    list.sort((a, b) => (b.orderAccuracy ?? -1) - (a.orderAccuracy ?? -1));
  } else {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const paged = paginate(list, page, pageSize);
  return c.json({
    data: {
      items: paged.items.map((prediction) => toPredictionResponse(prediction, sessionId)),
      total: paged.total,
    },
    meta: {
      page: paged.page,
      pageSize: paged.pageSize,
      hasMore: paged.hasMore,
    },
  });
});

app.get('/api/predictions', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const queryValidation = validateValue(listPredictionsQuerySchema, c.req.query());
  if (!queryValidation.success) {
    return queryValidation.response;
  }

  const page = queryValidation.data.page ?? 1;
  const pageSize = queryValidation.data.pageSize ?? 10;
  const sort = queryValidation.data.sort ?? 'created_at';
  const tourId = queryValidation.data.tourId ?? '';
  const performanceId = queryValidation.data.performanceId ?? '';
  const mine = queryValidation.data.mine === '1';
  const { hasSetlist } = queryValidation.data;

  const conditions: string[] = [];
  const whereValues: unknown[] = [];

  if (mine) {
    conditions.push('p.session_id = ?');
    whereValues.push(sessionId);
  }
  if (tourId) {
    conditions.push('p.tour_id = ?');
    whereValues.push(tourId);
  }
  if (performanceId) {
    conditions.push('p.performance_id = ?');
    whereValues.push(performanceId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let list = await listPredictionsFromDb(db, whereClause, whereValues, sessionId);

  await warmPerformanceDetailsCache(db, list.map((prediction) => prediction.performanceId));

  list = list.map((prediction) => withComputedAccuracy(prediction));

  if (hasSetlist === 'true') {
    list = list.filter(
      (prediction) => getPerformanceSetlistsFromMemory(prediction.performanceId).length > 0,
    );
  } else if (hasSetlist === 'false') {
    list = list.filter(
      (prediction) => getPerformanceSetlistsFromMemory(prediction.performanceId).length === 0,
    );
  }

  if (sort === 'likes') {
    list.sort((a, b) => b.likes - a.likes);
  } else if (sort === 'song_accuracy') {
    list.sort((a, b) => (b.songAccuracy ?? -1) - (a.songAccuracy ?? -1));
  } else if (sort === 'order_accuracy') {
    list.sort((a, b) => (b.orderAccuracy ?? -1) - (a.orderAccuracy ?? -1));
  } else {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const paged = paginate(list, page, pageSize);

  // Preload tours to populate tourCache for buildPerformanceTitle
  const tourIds = [...new Set(paged.items.map((p) => p.tourId))];
  await Promise.all(tourIds.map((tourId) => getTourById(tourId)));

  return c.json({
    data: {
      items: paged.items.map((prediction) => toPredictionResponse(prediction, sessionId)),
      total: paged.total,
    },
    meta: {
      page: paged.page,
      pageSize: paged.pageSize,
      hasMore: paged.hasMore,
    },
  });
});

app.post('/api/predictions/:id/like', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(predictionIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const exists = await db.prepare('SELECT id FROM predictions WHERE id = ?').bind(id).first();
  if (!exists) {
    return jsonError('PREDICTION_NOT_FOUND', `Prediction ${id} does not exist.`, 404);
  }

  await db.prepare(
    'INSERT OR IGNORE INTO likes (prediction_id, session_id) VALUES (?, ?)',
  ).bind(id, sessionId).run();

  const counter = await db.prepare(
    'SELECT COUNT(*) AS likes FROM likes WHERE prediction_id = ?',
  ).bind(id).first<{ likes: number | string }>();

  return c.json({ data: { likes: Number(counter?.likes ?? 0), likedByMe: true } });
});

app.delete('/api/predictions/:id/like', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(predictionIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const exists = await db.prepare('SELECT id FROM predictions WHERE id = ?').bind(id).first();
  if (!exists) {
    return jsonError('PREDICTION_NOT_FOUND', `Prediction ${id} does not exist.`, 404);
  }

  await db.prepare(
    'DELETE FROM likes WHERE prediction_id = ? AND session_id = ?',
  ).bind(id, sessionId).run();

  const counter = await db.prepare(
    'SELECT COUNT(*) AS likes FROM likes WHERE prediction_id = ?',
  ).bind(id).first<{ likes: number | string }>();

  return c.json({ data: { likes: Number(counter?.likes ?? 0), likedByMe: false } });
});

app.get('/api/predictions/:id/likes', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(predictionIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { id } = pathValidation.data;
  const exists = await db.prepare('SELECT id FROM predictions WHERE id = ?').bind(id).first();
  if (!exists) {
    return jsonError('PREDICTION_NOT_FOUND', `Prediction ${id} does not exist.`, 404);
  }

  const counter = await db.prepare(
    'SELECT COUNT(*) AS likes FROM likes WHERE prediction_id = ?',
  ).bind(id).first<{ likes: number | string }>();
  const likedByMe = await db.prepare(
    'SELECT 1 AS liked FROM likes WHERE prediction_id = ? AND session_id = ? LIMIT 1',
  ).bind(id, sessionId).first<{ liked: number }>();

  return c.json({
    data: {
      likes: Number(counter?.likes ?? 0),
      likedByMe: Boolean(likedByMe),
    },
  });
});

app.get('/api/performances/:performanceId/top-songs', async (c) => {
  const db = getDatabase(c);
  const pathValidation = validateValue(performanceIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { performanceId } = pathValidation.data;
  const items = await listSingleSongPredictions(db, performanceId, getSessionId(c));

  return c.json({ data: { items } });
});

app.get('/api/performances/:performanceId/song-predictions', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(performanceIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const { performanceId } = pathValidation.data;
  const items = await listSingleSongPredictions(db, performanceId, sessionId);
  return c.json({ data: { items } });
});

app.post('/api/performances/:performanceId/song-predictions/nominate', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(performanceIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = validateValue(nominateSongBodySchema, rawBody.data);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { performanceId } = pathValidation.data;
  const { tourId, songId } = bodyValidation.data;

  let tour: Tour | null;
  try {
    tour = await getTourById(tourId);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to validate tour from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!tour) {
    return jsonError('TOUR_NOT_FOUND', `Tour ${tourId} does not exist.`, 404);
  }
  if (!tourHasPerformance(tour, performanceId)) {
    return jsonError(
      'PERFORMANCE_NOT_IN_TOUR',
      'Performance does not belong to the provided tour.',
      400,
    );
  }
  if (isTourSubmissionClosed(tour)) {
    return jsonError('SUBMISSION_CLOSED', 'Prediction submission is closed for this tour.', 409);
  }

  await upsertSongNomination(db, performanceId, songId);
  await upsertSingleSongVote(db, performanceId, songId, 'will_sing', sessionId);

  return c.json({ data: { ok: true } }, 201);
});

app.post('/api/performances/:performanceId/song-predictions/vote', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(performanceIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = validateValue(voteSingleSongBodySchema, rawBody.data);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { performanceId } = pathValidation.data;
  const {
    tourId, songId, vote,
  } = bodyValidation.data;

  let tour: Tour | null;
  try {
    tour = await getTourById(tourId);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to validate tour from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!tour) {
    return jsonError('TOUR_NOT_FOUND', `Tour ${tourId} does not exist.`, 404);
  }
  if (!tourHasPerformance(tour, performanceId)) {
    return jsonError(
      'PERFORMANCE_NOT_IN_TOUR',
      'Performance does not belong to the provided tour.',
      400,
    );
  }
  if (isTourSubmissionClosed(tour)) {
    return jsonError('SUBMISSION_CLOSED', 'Prediction submission is closed for this tour.', 409);
  }

  const existingNomination = await db.prepare(
    `
      SELECT song_id
      FROM song_nominations
      WHERE performance_id = ? AND song_id = ?
      LIMIT 1
    `,
  ).bind(performanceId, songId).first();

  if (!existingNomination) {
    await upsertSongNomination(db, performanceId, songId);
  }

  await upsertSingleSongVote(db, performanceId, songId, vote, sessionId);
  return c.json({ data: { ok: true } });
});

app.delete('/api/performances/:performanceId/song-predictions/vote', async (c) => {
  const db = getDatabase(c);
  const sessionId = getSessionId(c);
  const pathValidation = validateValue(performanceIdParamSchema, c.req.param());
  if (!pathValidation.success) {
    return pathValidation.response;
  }

  const rawBody = await readJsonBody(c);
  if (!rawBody.ok) {
    return rawBody.response;
  }

  const bodyValidation = validateValue(deleteSingleSongVoteBodySchema, rawBody.data);
  if (!bodyValidation.success) {
    return bodyValidation.response;
  }

  const { performanceId } = pathValidation.data;
  const { tourId, songId } = bodyValidation.data;

  let tour: Tour | null;
  try {
    tour = await getTourById(tourId);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Failed to validate tour from ll-fans.';
    return jsonError('LLFANS_UNAVAILABLE', message, 502);
  }
  if (!tour) {
    return jsonError('TOUR_NOT_FOUND', `Tour ${tourId} does not exist.`, 404);
  }
  if (!tourHasPerformance(tour, performanceId)) {
    return jsonError(
      'PERFORMANCE_NOT_IN_TOUR',
      'Performance does not belong to the provided tour.',
      400,
    );
  }
  if (isTourSubmissionClosed(tour)) {
    return jsonError('SUBMISSION_CLOSED', 'Prediction submission is closed for this tour.', 409);
  }

  await db.prepare(
    `
      DELETE FROM song_prediction_votes
      WHERE performance_id = ? AND song_id = ? AND session_id = ?
    `,
  ).bind(performanceId, songId, sessionId).run();

  return c.json({ data: { ok: true } });
});

export default app;
