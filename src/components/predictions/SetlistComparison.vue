<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSetlistComparison } from '../../composables/useSetlistComparison';
import type { PredictionDraftItem, SetlistItem } from '../../types/domain';

const props = defineProps<{
  predictionItems: PredictionDraftItem[];
  actualSetlists: SetlistItem[];
}>();

const { computeSongAccuracy, computeOrderAccuracy } = useSetlistComparison();
const { t } = useI18n();

const songAccuracy = computed(() =>
  computeSongAccuracy(props.predictionItems, props.actualSetlists));

const orderAccuracy = computed(() =>
  computeOrderAccuracy(props.predictionItems, props.actualSetlists));

const predictedSongs = computed(() => {
  return props.predictionItems
    .filter((item) => item.type === 'song')
    .map((item) => item.songName ?? item.songId ?? '');
});

const actualSongs = computed(() => {
  return props.actualSetlists
    .filter((item) => item.contentType === 'song' && item.song)
    .map((item) => item.song?.name ?? '');
});
</script>

<template>
  <n-card
    :title="t('ui.setlistComparison')"
    size="small"
  >
    <n-space vertical>
      <n-space align="baseline">
        <n-tag type="info">
          {{ t('ui.songAccuracy') }}: {{ songAccuracy }}%
        </n-tag>
        <n-tag type="success">
          {{ t('ui.orderAccuracy') }}: {{ orderAccuracy }}%
        </n-tag>
        <div class="inline-muted">
          {{ t('ui.comparisonIgnoresTextItems') }}
        </div>
      </n-space>

      <div class="comparison-columns">
        <n-card
          size="small"
          :title="t('ui.predictedSetlist')"
        >
          <n-list bordered>
            <n-list-item
              v-for="(song, index) of predictedSongs"
              :key="`pred-${index}`"
            >
              {{ index + 1 }}. {{ song }}
            </n-list-item>
          </n-list>
        </n-card>

        <n-card
          size="small"
          :title="t('ui.actualSetlist')"
        >
          <n-list bordered>
            <n-list-item
              v-for="(song, index) of actualSongs"
              :key="`act-${index}`"
            >
              {{ index + 1 }}. {{ song }}
            </n-list-item>
          </n-list>
        </n-card>
      </div>
    </n-space>
  </n-card>
</template>

<style scoped>
.comparison-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 900px) {
  .comparison-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
