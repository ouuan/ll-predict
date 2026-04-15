export interface Venue {
  id: string;
  name: string;
}

export interface PerformanceSummary {
  id: string;
  name: string;
  predictionsCount: number;
  songNominationsCount: number;
}

export interface Concert {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  venue: Venue;
  performances: PerformanceSummary[];
}

export interface TourListItem {
  id: string;
  name: string;
  seriesIds: string[];
  startsOn: string;
  endsOn: string;
  performanceCount: number;
  predictionsCount: number;
  concerts: Concert[];
}

export interface SongItem {
  id: string;
  name: string;
  seriesIds: string[];
  releasedOn: string | null;
  artistVariantIds: string[];
}

export interface ArtistVariant {
  id: string;
  displayName: string;
}

export interface SetlistSong {
  id: string;
  name: string;
  seriesIds: string[];
}

export type SetlistContentType = 'song' | 'other';

export interface SetlistItem {
  id: string;
  indexPrefix: string;
  indexNumber: number | null;
  contentType: SetlistContentType;
  song: SetlistSong | null;
  contentTypeOther: string | null;
  note: string | null;
  premiere: boolean;
}

export interface PerformanceDetail {
  id: string;
  setlists: SetlistItem[];
}

export interface PredictionDraftItem {
  type: 'song' | 'text';
  songId?: string;
  songName?: string;
  text?: string;
  note?: string;
}

export interface Prediction {
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
  isOwner: boolean;
  tourStartsOn: string | null;
  hasSetlist: boolean;
  items: PredictionDraftItem[];
}

export interface TopSongItem {
  songId: string;
  songName: string;
  willSingCount: number;
  wontSingCount: number;
  willSingRatio: number;
  wontSingRatio: number;
}

export interface SingleSongPredictionItem {
  songId: string;
  songName: string;
  willSingCount: number;
  wontSingCount: number;
  willSingRatio: number;
  wontSingRatio: number;
  myVote: 'will_sing' | 'wont_sing' | null;
}
