import type { PredictionDraftItem, SetlistItem } from '../types/domain';

function editDistance(a: string[], b: string[]): number {
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
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const up = (dp[i - 1]?.[j] ?? 0) + 1;
      const left = (dp[i]?.[j - 1] ?? 0) + 1;
      const diagonal = (dp[i - 1]?.[j - 1] ?? 0) + cost;
      const row = dp[i];
      if (!row) {
        continue;
      }
      row[j] = Math.min(up, left, diagonal);
    }
  }

  return dp[a.length]?.[b.length] ?? 0;
}

function toSongSequenceFromPrediction(items: PredictionDraftItem[]): string[] {
  return items
    .filter((item) => item.type === 'song' && item.songId)
    .map((item) => item.songId)
    .filter((songId): songId is string => typeof songId === 'string');
}

function toSongSequenceFromSetlist(setlists: SetlistItem[]): string[] {
  return setlists
    .filter((item) => item.contentType === 'song' && item.song)
    .map((item) => item.song?.id)
    .filter((id): id is string => Boolean(id));
}

export function useSetlistComparison() {
  function computeSongAccuracy(
    predictionItems: PredictionDraftItem[],
    actualSetlists: SetlistItem[],
  ): number {
    const predictedSongs = toSongSequenceFromPrediction(predictionItems);
    const actualSongs = toSongSequenceFromSetlist(actualSetlists);

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

    const denominator = Math.max(predictedSongs.length, actualSongs.length, 1);
    return Math.round((overlap / denominator) * 10000) / 100;
  }

  function computeOrderAccuracy(
    predictionItems: PredictionDraftItem[],
    actualSetlists: SetlistItem[],
  ): number {
    const predictedSongs = toSongSequenceFromPrediction(predictionItems);
    const actualSongs = toSongSequenceFromSetlist(actualSetlists);
    const denominator = Math.max(predictedSongs.length, actualSongs.length, 1);
    const distance = editDistance(predictedSongs, actualSongs);
    const score = 1 - distance / denominator;
    return Math.max(0, Math.round(score * 10000) / 100);
  }

  return {
    computeSongAccuracy,
    computeOrderAccuracy,
  };
}
