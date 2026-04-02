<script setup lang="ts">
import { ArrowBackOutline, EyeOutline } from '@vicons/ionicons5';
import { watchImmediate } from '@vueuse/core';
import { useMessage } from 'naive-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import { api } from '../composables/useApi';
import type { Prediction, TourListItem } from '../types/domain';
import { formatPredictionFullTime, formatPredictionTime } from '../utils/date';

const message = useMessage();
const { t, locale } = useI18n();
const route = useRoute();

const tourId = computed(() => String(route.params.tourId ?? ''));
const performanceId = computed(() => {
  const routeValue = route.params.performanceId;
  return typeof routeValue === 'string' ? routeValue : undefined;
});
const songId = computed(() => {
  const routeValue = route.query.songId;
  return typeof routeValue === 'string' ? routeValue : undefined;
});

const loading = ref(false);
const items = ref<Prediction[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const sort = ref<'likes' | 'created_at' | 'song_accuracy' | 'order_accuracy'>('created_at');
const errorMessage = ref('');
const tour = ref<TourListItem | null>(null);
const useAutoSort = ref(true);
const selectedConcertName = computed(() => {
  if (!tour.value || !performanceId.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    if (concert.performances.some((p) => p.id === performanceId.value)) {
      return concert.name;
    }
  }

  return '';
});
const selectedPerformanceName = computed(() => {
  if (!tour.value || !performanceId.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    const perf = concert.performances.find((p) => p.id === performanceId.value);
    if (perf) {
      return perf.name;
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
const sortOptions = computed(() => [
  { label: t('ui.sortOption.orderAccuracy'), value: 'order_accuracy' },
  { label: t('ui.sortOption.songAccuracy'), value: 'song_accuracy' },
  { label: t('ui.sortOption.likes'), value: 'likes' },
  { label: t('ui.sortOption.createdTime'), value: 'created_at' },
]);

async function fetchTourDetail() {
  try {
    const res = await api.getTourDetail(tourId.value);
    tour.value = res.data;
  } catch {
    tour.value = null;
  }
}

async function fetchPredictions() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getTourPredictions(tourId.value, {
      page: page.value,
      pageSize: pageSize.value,
      performanceId: performanceId.value,
      songId: songId.value,
      sort: sort.value,
    });

    const recommendedSort = res.data.items.some((item) => item.songAccuracy !== null)
      ? 'order_accuracy'
      : 'created_at';

    if (useAutoSort.value && sort.value !== recommendedSort) {
      sort.value = recommendedSort;
      const adjustedRes = await api.getTourPredictions(tourId.value, {
        page: page.value,
        pageSize: pageSize.value,
        performanceId: performanceId.value,
        songId: songId.value,
        sort: sort.value,
      });
      items.value = adjustedRes.data.items;
      total.value = adjustedRes.data.total;
      return;
    }

    items.value = res.data.items;
    total.value = res.data.total;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

function onSortChange() {
  useAutoSort.value = false;
  page.value = 1;
  void fetchPredictions();
}

function onPageSizeChange() {
  page.value = 1;
  void fetchPredictions();
}

watchImmediate(
  () => [
    route.params.tourId,
    route.params.performanceId,
    route.query.songId,
  ],
  () => {
    useAutoSort.value = true;
    sort.value = 'created_at';
    page.value = 1;
    void fetchTourDetail();
    void fetchPredictions();
  },
);
</script>

<template>
  <n-space vertical>
    <error-alert
      v-if="errorMessage"
      :message="errorMessage"
    />
    <n-card size="small">
      <n-space
        align="center"
        justify="space-between"
      >
        <n-space align="center">
          <router-link :to="`/tours/${tourId}`">
            <n-button size="small">
              <template #icon>
                <n-icon><arrow-back-outline /></n-icon>
              </template>
              {{ t('ui.tourDetail') }}
            </n-button>
          </router-link>
          <strong v-if="contextTitle">
            {{ contextTitle }}
          </strong>
        </n-space>
        <n-space align="center">
          <span>{{ t('ui.sort') }}</span>
          <n-select
            v-model:value="sort"
            style="width: 220px"
            :options="sortOptions"
            @update:value="onSortChange"
          />
        </n-space>
      </n-space>
    </n-card>

    <loading-spinner :show="loading">
      <n-list
        v-if="items.length > 0"
        bordered
      >
        <n-list-item
          v-for="prediction of items"
          :key="prediction.id"
        >
          <div class="pred-item">
            <div class="pred-body">
              <div class="pred-header">
                <strong class="pred-nickname">{{ prediction.nickname }}</strong>
                <span
                  class="pred-time"
                  :title="formatPredictionFullTime(prediction.createdAt)"
                >
                  {{ formatPredictionTime(prediction.createdAt, locale as 'en' | 'zh' | 'ja') }}
                </span>
              </div>
              <div class="pred-perf">
                {{ prediction.performanceTitle || prediction.performanceName }}
              </div>
              <div
                v-if="prediction.description"
                class="pred-desc"
                :title="prediction.description"
              >
                {{ prediction.description }}
              </div>
              <div class="pred-meta">
                <n-tag size="small">
                  👍 {{ prediction.likes }}
                </n-tag>
                <template v-if="prediction.songAccuracy !== null">
                  <n-tag
                    size="small"
                    type="info"
                  >
                    {{ t('ui.songAccuracy') }} {{ prediction.songAccuracy }}%
                  </n-tag>
                  <n-tag
                    size="small"
                    type="success"
                  >
                    {{ t('ui.orderAccuracy') }} {{ prediction.orderAccuracy }}%
                  </n-tag>
                </template>
              </div>
            </div>
            <router-link :to="`/predictions/${prediction.id}`">
              <n-button>
                <template #icon>
                  <n-icon><eye-outline /></n-icon>
                </template>
                {{ t('ui.view') }}
              </n-button>
            </router-link>
          </div>
        </n-list-item>
      </n-list>
      <n-empty
        v-else
        :description="t('ui.noPredictionsFound')"
      />
    </loading-spinner>

    <n-pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :item-count="total"
      :page-sizes="[10, 20, 50]"
      show-size-picker
      @update:page="fetchPredictions"
      @update:page-size="onPageSizeChange"
    />
  </n-space>
</template>

<style scoped>
.pred-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.pred-body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pred-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.pred-nickname {
  font-size: 1rem;
}

.pred-time {
  font-size: 0.8rem;
  color: var(--n-text-color-disabled, #aaa);
}

.pred-perf {
  font-size: 0.85rem;
  color: var(--n-text-color-3, #888);
}

.pred-desc {
  font-size: 0.85rem;
  color: var(--n-text-color-3, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}

.pred-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
</style>
