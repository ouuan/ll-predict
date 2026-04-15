<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { ListOutline, OpenOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import PerformanceCard from '../components/tour/PerformanceCard.vue';
import { api } from '../composables/useApi';
import type { TourListItem } from '../types/domain';
import { formatDateRange } from '../utils/date';

const route = useRoute();
const message = useMessage();
const { t } = useI18n();

const loading = ref(false);
const tour = ref<TourListItem | null>(null);
const errorMessage = ref('');

const tourId = computed(() => String(route.params.tourId ?? ''));
const pageDocumentTitle = computed(() => {
  const parts: string[] = [];

  parts.push(t('app.pageTitle.tourDetail'));

  if (tour.value?.name) {
    parts.push(tour.value.name);
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

async function fetchTourDetail() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getTourDetail(tourId.value);
    tour.value = res.data;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchTourDetail();
});
</script>

<template>
  <n-space vertical>
    <error-alert
      v-if="errorMessage"
      :message="errorMessage"
    />
    <loading-spinner :show="loading">
      <n-card
        v-if="tour"
        class="card-gap"
      >
        <n-space vertical>
          <h2 style="margin: 0">
            {{ tour.name }}
          </h2>
          <div class="inline-muted">
            {{ formatDateRange(tour.startsOn, tour.endsOn) }}
          </div>

          <n-space>
            <n-a
              :href="`https://ll-fans.jp/data/event/${tour.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              <n-button>
                <template #icon>
                  <n-icon><open-outline /></n-icon>
                </template>
                {{ t('ui.viewOnLlFans') }}
              </n-button>
            </n-a>
            <router-link :to="`/tours/${tour.id}/predictions`">
              <n-button>
                <template #icon>
                  <n-icon><list-outline /></n-icon>
                </template>
                {{ t('ui.allPredictions') }} ({{ tour.predictionsCount }})
              </n-button>
            </router-link>
          </n-space>

          <n-space vertical>
            <n-card
              v-for="concert of tour.concerts"
              :key="concert.id"
              size="small"
            >
              <n-space vertical>
                <strong>{{ concert.name }}</strong>
                <div class="inline-muted">
                  {{ formatDateRange(concert.startsOn, concert.endsOn) }}
                </div>
                <div class="inline-muted">
                  {{ concert.venue.name }}
                </div>
                <div class="card-gap">
                  <performance-card
                    v-for="performance of concert.performances"
                    :key="performance.id"
                    :tour-id="tour.id"
                    :tour-starts-on="tour.startsOn"
                    :concert-name="concert.name"
                    :performance="performance"
                  />
                </div>
              </n-space>
            </n-card>
          </n-space>
        </n-space>
      </n-card>

      <n-card v-else>
        <n-tag type="warning">
          {{ t('ui.tourNotFound') }}
        </n-tag>
      </n-card>
    </loading-spinner>
  </n-space>
</template>
