import { useOnline } from '@vueuse/core';

export function useNetworkStatus() {
  return { isOnline: useOnline() };
}
