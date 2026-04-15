<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { ArrowBackOutline, SendOutline } from '@vicons/ionicons5';
import { useStorage } from '@vueuse/core';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import SetlistEditor from '../components/predict/SetlistEditor.vue';
import { api } from '../composables/useApi';
import type { PredictionDraftItem, TourListItem } from '../types/domain';
import {
  validateDescription,
  validateNickname,
  validatePredictionItems,
} from '../utils/validators';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { t } = useI18n();

const tourId = computed(() => String(route.params.tourId ?? ''));
const performanceId = computed(() => String(route.params.performanceId ?? ''));
const cloneHint = computed(() => {
  const value = route.query.cloneHint;
  return typeof value === 'string' ? value : undefined;
});
const autoCloneFromId = computed(() => {
  const value = route.query.cloneFrom;
  return typeof value === 'string' ? value : undefined;
});

const loadingTour = ref(true);
const tour = ref<TourListItem | null>(null);
const tourErrorMessage = ref('');

const concertName = computed(() => {
  if (!tour.value) return '';
  for (const concert of tour.value.concerts) {
    if (concert.performances.some((p) => p.id === performanceId.value)) {
      return concert.name;
    }
  }
  return '';
});

const performanceName = computed(() => {
  if (!tour.value) return '';
  for (const concert of tour.value.concerts) {
    const perf = concert.performances.find((p) => p.id === performanceId.value);
    if (perf) return perf.name;
  }
  return '';
});

const contextTitle = computed(() => {
  if (!tour.value) {
    return '';
  }

  const parts = [tour.value.name];
  if (concertName.value) {
    parts.push(concertName.value);
  }
  if (performanceName.value) {
    parts.push(performanceName.value);
  }
  return parts.join(' ');
});

const pageDocumentTitle = computed(() => {
  const parts: string[] = [];

  parts.push(t('app.pageTitle.predictSubmit'));

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

const submissionClosed = computed(() => {
  if (!tour.value) return false;
  const cutoff = Date.parse(`${tour.value.startsOn}T00:00:00+09:00`);
  if (!Number.isFinite(cutoff)) return false;
  return Date.now() >= cutoff;
});

const nickname = useStorage('ll-predict-nickname', '');
const description = ref('');
const items = ref<PredictionDraftItem[]>([]);
const submitting = ref(false);

async function fetchTour() {
  loadingTour.value = true;
  tourErrorMessage.value = '';
  try {
    const res = await api.getTourDetail(tourId.value);
    tour.value = res.data;
  } catch (error) {
    tourErrorMessage.value = (error as Error).message;
  } finally {
    loadingTour.value = false;
  }
}

async function submit() {
  const issues = [
    validateNickname(nickname.value),
    validateDescription(description.value),
    ...validatePredictionItems(items.value),
  ].filter(Boolean);

  if (issues.length > 0) {
    message.error((issues[0] as { message: string }).message);
    return;
  }

  submitting.value = true;
  try {
    const res = await api.createPrediction({
      tourId: tourId.value,
      performanceId: performanceId.value,
      nickname: nickname.value,
      description: description.value,
      items: items.value,
    });

    message.success(t('feedback.predictionSubmitted'));
    await router.push(`/predictions/${res.data.id}`);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void fetchTour();
});
</script>

<template>
  <n-space
    vertical
    class="card-gap"
  >
    <loading-spinner :show="loadingTour">
      <error-alert
        v-if="tourErrorMessage"
        :message="tourErrorMessage"
      />
      <n-card
        v-else-if="tour"
        size="small"
      >
        <n-space vertical>
          <div>
            <strong>{{ tour.name }}</strong>
          </div>
          <n-space>
            <div v-if="concertName">
              {{ concertName }}
            </div>
            <div v-if="performanceName">
              {{ performanceName }}
            </div>
          </n-space>
          <n-tag
            v-if="submissionClosed"
            type="error"
          >
            {{ t('ui.submissionClosed') }}
          </n-tag>
          <router-link :to="`/tours/${tourId}`">
            <n-button size="small">
              <template #icon>
                <n-icon><arrow-back-outline /></n-icon>
              </template>
              {{ t('ui.tourDetail') }}
            </n-button>
          </router-link>
        </n-space>
      </n-card>
    </loading-spinner>

    <template v-if="!loadingTour && !tourErrorMessage && !submissionClosed">
      <setlist-editor
        v-model="items"
        :clone-hint="cloneHint"
        :auto-clone-from-id="autoCloneFromId"
        :initial-series-ids="tour?.seriesIds ?? []"
        :performance-id="performanceId"
      />

      <n-card
        :title="t('ui.submissionForm')"
        size="small"
      >
        <n-space vertical>
          <n-form
            label-placement="top"
          >
            <n-form-item :label="t('ui.labels.nickname')">
              <n-input
                v-model:value="nickname"
                :placeholder="t('ui.placeholders.nickname')"
                :maxlength="50"
                show-count
              />
            </n-form-item>
            <n-form-item :label="t('ui.labels.description')">
              <n-input
                v-model:value="description"
                type="textarea"
                :placeholder="t('ui.placeholders.description')"
                :rows="4"
                :maxlength="1000"
                show-count
              />
            </n-form-item>
          </n-form>

          <n-space>
            <n-button
              :loading="submitting"
              type="primary"
              @click="submit"
            >
              <template #icon>
                <n-icon><send-outline /></n-icon>
              </template>
              {{ t('ui.action.submitPrediction') }}
            </n-button>
          </n-space>
        </n-space>
      </n-card>
    </template>
  </n-space>
</template>
