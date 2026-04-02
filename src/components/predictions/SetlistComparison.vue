<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSetlistComparison } from '../../composables/useSetlistComparison';
import type { PredictionDraftItem, SetlistItem } from '../../types/domain';

const props = defineProps<{
  predictionItems: PredictionDraftItem[];
  actualSetlists: SetlistItem[];
}>();

const {
  computeSongAccuracy,
  computeOrderAccuracy,
  alignSetlistsByEditDistance,
} = useSetlistComparison();
const { t } = useI18n();

const songAccuracy = computed(() =>
  computeSongAccuracy(props.predictionItems, props.actualSetlists));

const orderAccuracy = computed(() =>
  computeOrderAccuracy(props.predictionItems, props.actualSetlists));

const alignedRows = computed(() =>
  alignSetlistsByEditDistance(props.predictionItems, props.actualSetlists));

const mobilePredictedRows = computed(() =>
  alignedRows.value
    .filter((row) => Boolean(row.predicted))
    .map((row) => ({
      text: row.predicted ?? '',
      operation: row.operation,
    })));

const mobileActualRows = computed(() =>
  alignedRows.value
    .filter((row) => Boolean(row.actual))
    .map((row) => ({
      text: row.actual ?? '',
      operation: row.operation,
    })));

function mobilePredictedClass(operation: 'equal' | 'insert' | 'delete' | 'replace'): string {
  if (operation === 'delete') return 'comparison-cell--delete';
  if (operation === 'replace') return 'comparison-cell--replace';
  return '';
}

function mobileActualClass(operation: 'equal' | 'insert' | 'delete' | 'replace'): string {
  if (operation === 'insert') return 'comparison-cell--insert';
  if (operation === 'replace') return 'comparison-cell--replace';
  return '';
}
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

      <div class="comparison-grid comparison-grid--desktop">
        <div class="comparison-head">
          {{ t('ui.predictedSetlist') }}
        </div>
        <div class="comparison-head">
          {{ t('ui.actualSetlist') }}
        </div>

        <template
          v-for="(row, index) of alignedRows"
          :key="`row-${index}`"
        >
          <div
            class="comparison-cell"
            :class="row.predicted ? `comparison-cell--${row.operation}` : 'comparison-cell--empty'"
          >
            {{ row.predicted ?? '' }}
          </div>
          <div
            class="comparison-cell"
            :class="row.actual ? `comparison-cell--${row.operation}` : 'comparison-cell--empty'"
          >
            {{ row.actual ?? '' }}
          </div>
        </template>
      </div>

      <div class="comparison-mobile">
        <div class="comparison-head">
          {{ t('ui.predictedSetlist') }}
        </div>
        <div class="comparison-mobile-list">
          <div
            v-for="(row, index) of mobilePredictedRows"
            :key="`mobile-pred-${index}`"
            class="comparison-cell"
            :class="mobilePredictedClass(row.operation)"
          >
            {{ row.text }}
          </div>
        </div>

        <div class="comparison-head">
          {{ t('ui.actualSetlist') }}
        </div>
        <div class="comparison-mobile-list">
          <div
            v-for="(row, index) of mobileActualRows"
            :key="`mobile-actual-${index}`"
            class="comparison-cell"
            :class="mobileActualClass(row.operation)"
          >
            {{ row.text }}
          </div>
        </div>
      </div>
    </n-space>
  </n-card>
</template>

<style scoped>
.comparison-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: stretch;
}

.comparison-mobile {
  display: none;
}

.comparison-mobile-list {
  display: grid;
  gap: 8px;
}

.comparison-head {
  font-weight: 600;
  color: var(--n-text-color);
  padding: 4px 8px;
}

.comparison-cell {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px 10px;
  line-height: 1.4;
}

.comparison-cell--empty {
  border: none;
  background: transparent;
}

.comparison-cell--insert {
  background: rgba(24, 160, 88, 0.12);
}

.comparison-cell--delete {
  background: rgba(208, 48, 80, 0.08);
}

.comparison-cell--replace {
  background: rgba(240, 160, 32, 0.12);
}

@media (max-width: 900px) {
  .comparison-grid--desktop {
    display: none;
  }

  .comparison-mobile {
    display: grid;
    gap: 8px;
  }
}
</style>
