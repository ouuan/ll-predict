<script setup lang="ts">
import { RefreshOutline } from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../composables/useApi';
import type { PerformanceSummary } from '../../types/domain';

const props = defineProps<{
  tourId: string;
  tourStartsOn: string;
  concertName: string;
  performance: PerformanceSummary;
}>();

const message = useMessage();
const { t } = useI18n();
const hasActualSetlist = ref(false);
const refreshLoading = ref(false);

const submissionClosed = computed(() => {
  const cutoff = Date.parse(`${props.tourStartsOn}T00:00:00+09:00`);
  if (!Number.isFinite(cutoff)) {
    return false;
  }
  return Date.now() >= cutoff;
});

const predictionButtonText = computed(() => {
  const count = props.performance.predictionsCount;
  return `${t('ui.predictions')} (${count})`;
});

const singleSongPredictionButtonText = computed(() => {
  const count = props.performance.songNominationsCount;
  const label = submissionClosed.value
    ? t('ui.singleSongPredictionList')
    : t('ui.predictSingleSong');
  return `${label} (${count})`;
});

const predictionButtonType = computed(() => {
  if (hasActualSetlist.value) {
    return 'primary';
  }
  return 'default';
});

async function detectActualSetlist() {
  try {
    const res = await api.getPerformanceDetail(props.performance.id);
    hasActualSetlist.value = res.data.setlists.length > 0;
  } catch {
    hasActualSetlist.value = false;
  }
}

async function refreshPerformance() {
  refreshLoading.value = true;
  try {
    const res = await api.refreshPerformanceDetail(props.performance.id);
    hasActualSetlist.value = res.data.setlists.length > 0;
    message.success(t('feedback.performanceRefreshed'));
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    refreshLoading.value = false;
  }
}

onMounted(() => {
  void detectActualSetlist();
});
</script>

<template>
  <n-card
    size="small"
    class="card-gap"
  >
    <n-space align="center">
      <div>
        <strong>{{ performance.name }}</strong>
      </div>
      <router-link
        v-if="!submissionClosed"
        :to="`/tours/${tourId}/performances/${performance.id}/predict`"
      >
        <n-button
          size="small"
          type="primary"
        >
          {{ t('ui.predict') }}
        </n-button>
      </router-link>
      <router-link
        :to="`/tours/${tourId}/performances/${performance.id}/song-predictions`"
      >
        <n-button
          size="small"
          secondary
          type="primary"
        >
          {{ singleSongPredictionButtonText }}
        </n-button>
      </router-link>
      <router-link
        :to="`/tours/${tourId}/performances/${performance.id}/predictions`"
      >
        <n-button
          size="small"
          :type="predictionButtonType"
        >
          {{ predictionButtonText }}
        </n-button>
      </router-link>
      <n-button
        size="small"
        :loading="refreshLoading"
        @click="refreshPerformance"
      >
        <template #icon>
          <n-icon><refresh-outline /></n-icon>
        </template>
        {{ t('ui.refreshPerformance') }}
      </n-button>
    </n-space>
  </n-card>
</template>
