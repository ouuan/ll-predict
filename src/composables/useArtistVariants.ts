import { useStorage } from '@vueuse/core';
import { api } from './useApi';

const cache = useStorage<Record<string, string>>('ll-predict-artist-variants', {});
let fetching = false;

export function useArtistVariants() {
  function getDisplayName(id: string): string {
    return cache.value[id] ?? id;
  }

  async function refreshIfMissing(ids: string[]) {
    if (fetching) return;
    if (ids.length === 0 || ids.every((id) => id in cache.value)) return;

    fetching = true;
    try {
      const res = await api.getArtistVariants();
      const updated: Record<string, string> = {};
      for (const v of res.data.items) {
        updated[v.id] = v.displayName;
      }
      cache.value = updated;
    } catch {
      // ignore failures silently
    } finally {
      fetching = false;
    }
  }

  return { getDisplayName, refreshIfMissing };
}
