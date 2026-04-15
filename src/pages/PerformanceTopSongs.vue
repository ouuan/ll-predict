<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { ListOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import { api } from '../composables/useApi';
import type { TopSongItem, TourListItem } from '../types/domain';

const route = useRoute();
const message = useMessage();
const { t } = useI18n();

const performanceId = computed(() => String(route.params.performanceId ?? ''));
const tourId = computed(() => String(route.params.tourId ?? ''));
const loading = ref(false);
const items = ref<TopSongItem[]>([]);
const errorMessage = ref('');
const tour = ref<TourListItem | null>(null);
const selectedConcertName = computed(() => {
  if (!tour.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    if (concert.performances.some((performance) => performance.id === performanceId.value)) {
      return concert.name;
    }
  }

  return '';
});
const selectedPerformanceName = computed(() => {
  if (!tour.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    const performance = concert.performances.find((item) => item.id === performanceId.value);
    if (performance) {
      return performance.name;
    }
  }

  return '';
});
const contextTitle = computed(() => {
  if (!tour.value) {
    return '';
  }

  const parts = [tour.value.name];
  if (selectedConcertName.value) {
    parts.push(selectedConcertName.value);
  }
  if (selectedPerformanceName.value) {
    parts.push(selectedPerformanceName.value);
  }

  return parts.join(' ');
});
const pageDocumentTitle = computed(() => {
  const parts: string[] = [];

  parts.push(t('app.pageTitle.topSongs'));

  if (contextTitle.value) {
    parts.push(contextTitle.value);
  }

  parts.push(t('app.name'));
  return parts.join(' - ');
});

useHead(computed(() => ({
  title: pageDocumentTitle.value,
  meta: [
    { property: 'og:title', content: pageDocumentTitle.value },
  ],
})));

async function fetchTour() {
  try {
    const res = await api.getTourDetail(tourId.value);
    tour.value = res.data;
  } catch {
    tour.value = null;
  }
}

async function fetchTopSongs() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getTopSongs(performanceId.value);
    items.value = res.data.items;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchTour();
  void fetchTopSongs();
});
</script>

<template>
  <n-space vertical>
    <error-alert
      v-if="errorMessage"
      :message="errorMessage"
    />
    <loading-spinner :show="loading">
      <n-list
        v-if="items.length > 0"
        bordered
      >
        <n-list-item
          v-for="item of items"
          :key="item.songId"
        >
          <n-space
            justify="space-between"
            style="width: 100%"
          >
            <div>
              <n-a
                :href="`https://ll-fans.jp/data/song/${item.songId}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{{ item.songName }}</strong>
              </n-a>
            </div>
            <n-space align="center">
              <router-link
                :to="{
                  path: `/tours/${tourId}/performances/${performanceId}/predictions`,
                  query: { songId: item.songId },
                }"
              >
                <n-button size="small">
                  <template #icon>
                    <n-icon><list-outline /></n-icon>
                  </template>
                  {{ t('ui.predictions') }}
                </n-button>
              </router-link>
              <n-tag>
                {{ t('ui.willSingCount', { count: item.willSingCount }) }}
              </n-tag>
              <n-tag type="info">
                {{ t('ui.wontSingCount', { count: item.wontSingCount }) }}
              </n-tag>
            </n-space>
          </n-space>
        </n-list-item>
      </n-list>
      <n-empty
        v-else
        :description="t('ui.noTopSongsYet')"
      />
    </loading-spinner>
  </n-space>
</template>
