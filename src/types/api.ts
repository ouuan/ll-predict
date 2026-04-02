export interface PaginationMeta {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginatedData<T> {
  data: {
    total: number;
    items: T[];
  };
  meta: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ListEnvelope<T> {
  data: {
    items: T[];
    total: number;
  };
  meta: PaginationMeta;
}
