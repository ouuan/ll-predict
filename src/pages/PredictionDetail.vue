<script setup lang="ts">
import { useHead } from '@unhead/vue';
import {
  CopyOutline,
  ImageOutline,
  InformationCircleOutline,
  ListOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import SetlistComparison from '../components/predictions/SetlistComparison.vue';
import { api } from '../composables/useApi';
import { SITE_URL } from '../constants/site';
import type { PerformanceDetail, Prediction } from '../types/domain';
import { formatPredictionFullTime, formatPredictionTime } from '../utils/date';
import { downloadShareImage, generatePredictionShareImage } from '../utils/predictionShareImage';

const message = useMessage();
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id ?? ''));
const loading = ref(false);
const prediction = ref<Prediction | null>(null);
const performanceDetail = ref<PerformanceDetail | null>(null);
const cloneTargetOptions = ref<{ label: string; value: string }[]>([]);
const showOtherTourCloneDialog = ref(false);
const shareImageLoading = ref(false);
const showSharePreviewDialog = ref(false);
const shareImageDataUrl = ref('');
const shareImageFilename = ref('');
const errorMessage = ref('');
const hasActualSetlist = computed(() => (performanceDetail.value?.setlists.length ?? 0) > 0);
const predictionContextName = computed(() =>
  prediction.value?.performanceTitle
  || prediction.value?.performanceName
  || '');
const predictionTitleLabel = computed(() => {
  const nickname = prediction.value?.nickname.trim();
  if (nickname) {
    return t('ui.predictionByNicknameTitle', { nickname });
  }
  return t('app.pageTitle.predictionDetail');
});
const pageDocumentTitle = computed(() => {
  const parts: string[] = [];

  parts.push(predictionTitleLabel.value);
  if (predictionContextName.value) {
    parts.push(predictionContextName.value);
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

async function fetchPrediction() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getPrediction(id.value);
    prediction.value = res.data;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

async function fetchPerformanceDetail() {
  if (!prediction.value) return;
  try {
    const res = await api.getPerformanceDetail(prediction.value.performanceId);
    performanceDetail.value = res.data;
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function fetchCloneTargetOptions() {
  if (!prediction.value) return;

  try {
    const res = await api.getTourDetail(prediction.value.tourId);
    const tourName = res.data.name.trim();
    const options = res.data.concerts.flatMap((concert) =>
      concert.performances.map((performance) => {
        const concertName = (concert.name ?? '').trim();
        const performanceName = performance.name.trim();
        const label = [concertName, performanceName].filter(Boolean).join(' ') || tourName;

        return {
          label,
          value: performance.id,
        };
      }));

    cloneTargetOptions.value = [
      ...options,
      {
        label: t('ui.cloneToOtherTour'),
        value: '__other_tour__',
      },
    ];
  } catch {
    cloneTargetOptions.value = [
      {
        label: t('ui.cloneToOtherTour'),
        value: '__other_tour__',
      },
    ];
  }
}

async function toggleLike() {
  if (!prediction.value) return;
  try {
    if (prediction.value.likedByMe) {
      const res = await api.unlikePrediction(prediction.value.id);
      prediction.value.likes = res.data.likes;
      prediction.value.likedByMe = res.data.likedByMe;
    } else {
      const res = await api.likePrediction(prediction.value.id);
      prediction.value.likes = res.data.likes;
      prediction.value.likedByMe = res.data.likedByMe;
    }
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function removePrediction() {
  if (!prediction.value) return;

  try {
    await api.deletePrediction(prediction.value.id);
    message.success(t('feedback.predictionDeleted'));
    await router.push('/predictions');
  } catch (error) {
    message.error((error as Error).message);
  }
}

async function goToClone(targetValue: string | null) {
  if (!prediction.value) return;
  if (!targetValue) return;

  if (targetValue === '__other_tour__') {
    showOtherTourCloneDialog.value = true;
    return;
  }

  await router.push({
    path: [`/tours/${prediction.value.tourId}`, `/performances/${targetValue}/predict`].join(''),
    query: {
      cloneFrom: String(prediction.value.id),
    },
  });
}

async function generateShareImage() {
  if (!prediction.value) return;

  shareImageLoading.value = true;
  try {
    const detailUrl = new URL(`/predictions/${prediction.value.id}`, SITE_URL).toString();
    const result = await generatePredictionShareImage(
      prediction.value,
      {
        appName: t('app.name'),
        setlistTitle: t('ui.shareImageTitle', { nickname: prediction.value.nickname }),
        scanHint: t('ui.shareImageScanHint'),
      },
      detailUrl,
    );
    shareImageDataUrl.value = result.dataUrl;
    shareImageFilename.value = result.filename;
    showSharePreviewDialog.value = true;
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    shareImageLoading.value = false;
  }
}

function downloadCurrentShareImage() {
  if (!shareImageDataUrl.value || !shareImageFilename.value) {
    return;
  }
  downloadShareImage(shareImageDataUrl.value, shareImageFilename.value);
  message.success(t('feedback.shareImageGenerated'));
}

onMounted(async () => {
  await fetchPrediction();
  await fetchPerformanceDetail();
  await fetchCloneTargetOptions();
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
        v-if="prediction"
        class="card-gap"
      >
        <n-space vertical>
          <n-thing>
            <template #header>
              {{ prediction.nickname }}
            </template>
            <template #description>
              <div>{{ prediction.performanceTitle || prediction.performanceName }}</div>
              <div
                class="inline-muted"
                style="margin-top: 4px"
                :title="formatPredictionFullTime(prediction.createdAt)"
              >
                {{ formatPredictionTime(prediction.createdAt, locale as 'en' | 'zh' | 'ja') }}
              </div>
            </template>
            <div>{{ prediction.description || t('ui.noDescription') }}</div>
          </n-thing>

          <n-space>
            <n-button
              :title="prediction.likedByMe ? t('ui.tooltip.unlike') : t('ui.tooltip.like')"
              :type="prediction.likedByMe ? 'primary' : 'default'"
              @click="toggleLike"
            >
              👍 {{ prediction.likes }}
            </n-button>
            <n-popselect
              :options="cloneTargetOptions"
              trigger="click"
              @update:value="goToClone"
            >
              <n-button>
                <template #icon>
                  <n-icon><copy-outline /></n-icon>
                </template>
                {{ t('ui.clone') }}
              </n-button>
            </n-popselect>
            <n-button
              :loading="shareImageLoading"
              @click="generateShareImage"
            >
              <template #icon>
                <n-icon><image-outline /></n-icon>
              </template>
              {{ t('ui.shareImage') }}
            </n-button>
            <router-link :to="`/tours/${prediction.tourId}`">
              <n-button>
                <template #icon>
                  <n-icon><information-circle-outline /></n-icon>
                </template>
                {{ t('ui.tourDetail') }}
              </n-button>
            </router-link>
            <router-link :to="`/tours/${prediction.tourId}/predictions`">
              <n-button>
                <template #icon>
                  <n-icon><list-outline /></n-icon>
                </template>
                {{ t('ui.predictionList') }}
              </n-button>
            </router-link>
            <n-popconfirm
              v-if="prediction.isOwner"
              :positive-text="t('ui.delete')"
              :negative-text="t('ui.cancel')"
              @positive-click="removePrediction"
            >
              <template #trigger>
                <n-button type="error">
                  <template #icon>
                    <n-icon><trash-outline /></n-icon>
                  </template>
                  {{ t('ui.action.deleteMyPrediction') }}
                </n-button>
              </template>
              {{ t('ui.confirm.deletePrediction') }}
            </n-popconfirm>
          </n-space>

          <n-card
            :title="t('ui.predictedSetlist')"
            size="small"
          >
            <n-list
              v-if="prediction.items.length > 0"
              bordered
            >
              <n-list-item
                v-for="(item, index) of prediction.items"
                :key="`${item.type}-${index}`"
              >
                <div class="prediction-item-main">
                  <span
                    class="prediction-item-icon"
                    :title="
                      item.type === 'song'
                        ? t('ui.tooltip.songItem')
                        : t('ui.tooltip.textItem')
                    "
                  >
                    {{ item.type === 'song' ? '🎵' : '📝' }}
                  </span>
                  <span v-if="item.type === 'song'">
                    <n-a
                      v-if="item.songId"
                      :href="`https://ll-fans.jp/data/song/${item.songId}`"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ item.songName }}
                    </n-a>
                    <span v-else>{{ item.songName }}</span>
                  </span>
                  <span v-else>
                    {{ item.text }}
                  </span>
                </div>
                <div
                  v-if="item.note"
                  class="inline-muted"
                >
                  {{ t('common.note') }}: {{ item.note }}
                </div>
              </n-list-item>
            </n-list>
            <n-empty
              v-else
              :description="t('ui.noSetlistItems')"
            />
          </n-card>

          <setlist-comparison
            v-if="performanceDetail && hasActualSetlist"
            :prediction-items="prediction.items"
            :actual-setlists="performanceDetail.setlists"
          />

          <n-modal
            v-model:show="showOtherTourCloneDialog"
            preset="dialog"
            :title="t('ui.cloneToOtherTour')"
            :positive-text="t('common.gotIt')"
            @positive-click="showOtherTourCloneDialog = false"
          >
            {{ t('ui.cloneManualDialog', { id: prediction.id }) }}
          </n-modal>

          <n-modal v-model:show="showSharePreviewDialog">
            <n-card
              :title="t('ui.shareImage')"
              style="width: min(92vw, 760px); max-height: 92vh"
              :bordered="false"
              class="share-preview-card"
            >
              <n-space vertical>
                <img
                  v-if="shareImageDataUrl"
                  :src="shareImageDataUrl"
                  :alt="t('ui.shareImage')"
                  class="share-preview-image"
                >
                <n-space justify="end">
                  <n-button @click="showSharePreviewDialog = false">
                    {{ t('ui.cancel') }}
                  </n-button>
                  <n-button
                    type="primary"
                    @click="downloadCurrentShareImage"
                  >
                    {{ t('ui.downloadImage') }}
                  </n-button>
                </n-space>
              </n-space>
            </n-card>
          </n-modal>
        </n-space>
      </n-card>
    </loading-spinner>
  </n-space>
</template>

<style scoped>
.prediction-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prediction-item-icon {
  flex: 0 0 auto;
}

.share-preview-image {
  width: 100%;
  max-height: calc(92vh - 180px);
  object-fit: contain;
}

.share-preview-card {
  overflow: auto;
}
</style>
