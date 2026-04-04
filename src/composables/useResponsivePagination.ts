import { useMediaQuery } from '@vueuse/core';
import { computed } from 'vue';

export function useResponsivePagination() {
  const isNarrowScreen = useMediaQuery('(max-width: 640px)');
  const paginationPageSlot = computed(() => (isNarrowScreen.value ? 5 : 9));

  return {
    paginationPageSlot,
  };
}
