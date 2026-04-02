<script setup lang="ts">
import { EyeOutline } from '@vicons/ionicons5';
import { useStorage } from '@vueuse/core';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import { api } from '../composables/useApi';
import type { TourListItem } from '../types/domain';
import { formatDateRange } from '../utils/date';
import { getSeriesColor, getSeriesLabel, getSeriesOptions } from '../utils/series';

const message = useMessage();
const { t, locale } = useI18n();
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const tours = ref<TourListItem[]>([]);
const errorMessage = ref('');
const selectedSeriesIds = useStorage<string[]>('tourListSeriesFilter', []);

const seriesOptions = computed(() => getSeriesOptions(locale.value));

async function fetchTours() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getTours({
      page: page.value,
      pageSize: pageSize.value,
      seriesIds: selectedSeriesIds.value.length > 0 ? selectedSeriesIds.value : undefined,
    });
    tours.value = res.data.items;
    total.value = res.data.total;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

function onSeriesFilterChange() {
  page.value = 1;
  void fetchTours();
}

function toggleSeriesFilter(sid: string) {
  if (selectedSeriesIds.value.includes(sid)) {
    selectedSeriesIds.value = selectedSeriesIds.value.filter((s) => s !== sid);
  } else {
    selectedSeriesIds.value = [...selectedSeriesIds.value, sid];
  }
  onSeriesFilterChange();
}

onMounted(() => {
  void fetchTours();
});
</script>

<template>
  <n-space vertical>
    <error-alert
      v-if="errorMessage"
      :message="errorMessage"
    />
    <n-select
      v-model:value="selectedSeriesIds"
      :options="seriesOptions"
      :placeholder="t('ui.placeholders.selectSeries')"
      multiple
      clearable
      filterable
      @update:value="onSeriesFilterChange"
    />
    <n-card>
      <loading-spinner :show="loading">
        <n-list
          v-if="tours.length > 0"
          bordered
        >
          <n-list-item
            v-for="tour of tours"
            :key="tour.id"
          >
            <div class="tour-item">
              <div class="tour-info">
                <strong>{{ tour.name }}</strong>
                <div class="inline-muted">
                  {{ formatDateRange(tour.startsOn, tour.endsOn) }}
                </div>
                <div class="inline-muted">
                  {{ t('ui.predictionsCount', { count: tour.predictionsCount }) }}
                </div>
                <n-space
                  v-if="tour.seriesIds.length > 0"
                  size="small"
                  style="margin-top: 4px"
                >
                  <n-tag
                    v-for="sid of tour.seriesIds"
                    :key="sid"
                    size="small"
                    :color="{
                      color: getSeriesColor(sid),
                      textColor: '#fff',
                      borderColor: 'transparent',
                    }"
                    :style="{
                      cursor: 'pointer',
                      opacity:
                        selectedSeriesIds.length > 0 && !selectedSeriesIds.includes(sid)
                          ? '0.4'
                          : '1',
                    }"
                    @click="() => toggleSeriesFilter(sid)"
                  >
                    {{ getSeriesLabel(sid, locale) }}
                  </n-tag>
                </n-space>
              </div>
              <router-link :to="`/tours/${tour.id}`">
                <n-button type="primary">
                  <template #icon>
                    <n-icon><eye-outline /></n-icon>
                  </template>
                  {{ t('ui.viewDetail') }}
                </n-button>
              </router-link>
            </div>
          </n-list-item>
        </n-list>
        <n-empty
          v-else
          :description="t('ui.noToursFound')"
        />
      </loading-spinner>
    </n-card>

    <n-pagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :item-count="total"
      :page-sizes="[10, 20, 50]"
      show-size-picker
      @update:page="fetchTours"
      @update:page-size="fetchTours"
    />
  </n-space>
</template>

<style scoped>
.tour-item {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.tour-info {
  flex: 1 1 0;
  min-width: 0;
}

@media (max-width: 600px) {
  .tour-item {
    flex-direction: column;
  }
}
</style>
