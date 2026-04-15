<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { EyeOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import { api } from '../composables/useApi';
import { useResponsivePagination } from '../composables/useResponsivePagination';
import type { Prediction } from '../types/domain';
import { formatPredictionFullTime, formatPredictionTime } from '../utils/date';

const message = useMessage();
const { t, locale } = useI18n();
const pageDocumentTitle = computed(() => [
  t('app.pageTitle.myPredictions'),
  t('app.name'),
].join(' - '));

useHead(computed(() => ({
  title: pageDocumentTitle.value,
  meta: [
    { property: 'og:title', content: pageDocumentTitle.value },
  ],
})));

const loading = ref(false);
const items = ref<Prediction[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const sort = ref<'created_at' | 'likes' | 'song_accuracy' | 'order_accuracy'>('created_at');
const hasSetlist = ref<'all' | 'true' | 'false'>('all');
const onlyMine = ref(true);
const errorMessage = ref('');
const { paginationPageSlot } = useResponsivePagination();
const sortOptions = computed(() => [
  { label: t('ui.sortOption.createdTime'), value: 'created_at' },
  { label: t('ui.sortOption.likes'), value: 'likes' },
  { label: t('ui.sortOption.songAccuracy'), value: 'song_accuracy' },
  { label: t('ui.sortOption.orderAccuracy'), value: 'order_accuracy' },
]);
const setlistOptions = computed(() => [
  { label: t('ui.setlistFilter.all'), value: 'all' },
  { label: t('ui.setlistFilter.available'), value: 'true' },
  { label: t('ui.setlistFilter.unavailable'), value: 'false' },
]);

async function fetchPredictions() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const hasSetlistFilter = hasSetlist.value === 'all'
      ? undefined
      : hasSetlist.value === 'true';

    const params = {
      page: page.value,
      pageSize: pageSize.value,
      hasSetlist: hasSetlistFilter,
      mine: onlyMine.value,
      sort: sort.value,
    };

    const res = await api.getAllPredictions(params);
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

function onFilterChange() {
  page.value = 1;
  void fetchPredictions();
}

function onPageSizeChange() {
  page.value = 1;
  void fetchPredictions();
}

onMounted(() => {
  void fetchPredictions();
});
</script>

<template>
  <n-space vertical>
    <error-alert
      v-if="errorMessage"
      :message="errorMessage"
    />
    <n-card size="small">
      <n-space
        size="large"
        align="center"
        wrap
      >
        <n-form-item
          :label="t('ui.onlyMine')"
          label-placement="left"
          :show-feedback="false"
        >
          <n-switch
            v-model:value="onlyMine"
            @update:value="onFilterChange"
          />
        </n-form-item>

        <n-form-item
          :label="t('ui.sort')"
          label-placement="left"
          :show-feedback="false"
        >
          <n-select
            v-model:value="sort"
            style="width: 220px"
            :options="sortOptions"
            @update:value="onFilterChange"
          />
        </n-form-item>

        <n-select
          v-model:value="hasSetlist"
          style="width: 180px"
          :options="setlistOptions"
          @update:value="onFilterChange"
        />
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
                <strong class="pred-perf-title">
                  {{ prediction.performanceTitle || prediction.performanceName }}
                </strong>
              </div>
              <div class="pred-subheader">
                <span
                  v-if="!onlyMine"
                  class="pred-nickname"
                >
                  {{ prediction.nickname }}
                </span>
                <span
                  class="pred-time"
                  :title="formatPredictionFullTime(prediction.createdAt)"
                >
                  {{ formatPredictionTime(prediction.createdAt, locale as 'en' | 'zh' | 'ja') }}
                </span>
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
                <n-tag
                  v-if="
                    !prediction.hasSetlist
                      && prediction.tourStartsOn
                      && Date.now() >= Date.parse(`${prediction.tourStartsOn}T00:00:00+09:00`)
                  "
                  type="warning"
                  size="small"
                >
                  {{ t('ui.submissionClosed') }}
                </n-tag>
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

    <div class="pagination-wrap">
      <n-pagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :item-count="total"
        :page-slot="paginationPageSlot"
        :page-sizes="[10, 20, 50]"
        show-size-picker
        @update:page="fetchPredictions"
        @update:page-size="onPageSizeChange"
      />
    </div>
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

.pred-perf-title {
  font-size: 1rem;
}

.pred-subheader {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.pred-nickname {
  font-size: 0.85rem;
  color: var(--n-text-color-3, #888);
}

.pred-time {
  font-size: 0.8rem;
  color: var(--n-text-color-disabled, #aaa);
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

.pagination-wrap {
  display: flex;
  justify-content: center;
}
</style>
