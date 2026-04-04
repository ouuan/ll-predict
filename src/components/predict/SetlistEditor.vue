<script setup lang="ts">
import {
  AddOutline,
  ArrowDownOutline,
  ArrowUpOutline,
  CloseOutline,
  CopyOutline,
  ReturnDownForwardOutline,
  ReturnUpBackOutline,
  SearchOutline,
  SwapVerticalOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../composables/useApi';
import type { PredictionDraftItem, SongItem } from '../../types/domain';
import { validateTextItem } from '../../utils/validators';
import SongSearch from './SongSearch.vue';

const props = defineProps<{
  cloneHint?: string;
  autoCloneFromId?: string;
  initialSeriesIds: string[];
  performanceId?: string;
}>();

const model = defineModel<PredictionDraftItem[]>({ required: true });
const message = useMessage();
const { t } = useI18n();

const textDraft = ref('');
const textError = ref<string | null>(null);
const clonePredictionId = ref('');
const cloneLoading = ref(false);
const cloneError = ref<string | null>(null);
const showCloneReplaceConfirm = ref(false);
const moveSourceIndex = ref<number | null>(null);
const showSongSearchDialog = ref(false);

function addSong(song: SongItem) {
  model.value.push({
    type: 'song',
    songId: song.id,
    songName: song.name,
    note: '',
  });
  message.success(t('feedback.songAdded', { name: song.name }));
}

function addTextItem() {
  const issue = validateTextItem(textDraft.value);
  if (issue) {
    textError.value = issue.message;
    return;
  }

  model.value.push({
    type: 'text',
    text: textDraft.value,
    note: '',
  });

  textDraft.value = '';
  textError.value = null;
}

function replaceItems(items: PredictionDraftItem[]) {
  model.value = items.map((item) => ({ ...item }));
}

async function cloneFromPrediction(forceReplace = false) {
  const trimmedId = clonePredictionId.value.trim();
  if (!/^\d+$/.test(trimmedId)) {
    cloneError.value = t('ui.validation.predictionIdPositiveInteger');
    return;
  }

  if (!forceReplace && model.value.length > 0) {
    // Manual trigger with non-empty setlist should go through popconfirm flow.
    return;
  }

  cloneLoading.value = true;
  cloneError.value = null;
  showCloneReplaceConfirm.value = false;
  try {
    const res = await api.getPrediction(trimmedId);
    replaceItems(res.data.items);
    message.success(t('feedback.clonedSetlist', { id: trimmedId }));
  } catch (error) {
    cloneError.value = (error as Error).message;
  } finally {
    cloneLoading.value = false;
  }
}

function submitCloneInput() {
  if (cloneLoading.value) {
    return;
  }

  if (model.value.length === 0) {
    void cloneFromPrediction();
    return;
  }

  showCloneReplaceConfirm.value = true;
}

onMounted(() => {
  if (!props.autoCloneFromId) {
    return;
  }

  clonePredictionId.value = props.autoCloneFromId;
  void cloneFromPrediction(true);
});

function removeItem(index: number) {
  model.value.splice(index, 1);
}

function move(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= model.value.length) return;
  const [item] = model.value.splice(index, 1);
  if (!item) return;
  model.value.splice(target, 0, item);
}

function startMoveTo(index: number) {
  moveSourceIndex.value = index;
}

function cancelMoveTo() {
  moveSourceIndex.value = null;
}

function moveTo(targetIndex: number, position: 'above' | 'below') {
  const sourceIndex = moveSourceIndex.value;
  if (sourceIndex === null) return;
  if (sourceIndex < 0 || sourceIndex >= model.value.length) {
    moveSourceIndex.value = null;
    return;
  }

  let insertIndex = position === 'above' ? targetIndex : targetIndex + 1;

  const [item] = model.value.splice(sourceIndex, 1);
  if (!item) {
    moveSourceIndex.value = null;
    return;
  }

  if (sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  if (insertIndex < 0) {
    insertIndex = 0;
  }
  if (insertIndex > model.value.length) {
    insertIndex = model.value.length;
  }

  model.value.splice(insertIndex, 0, item);
  moveSourceIndex.value = null;
}

const countText = computed(() => t('ui.labels.totalItems', { count: model.value.length }));

defineExpose({
  addSong,
});
</script>

<template>
  <n-card
    :title="t('ui.setlistEditor')"
    size="small"
  >
    <n-space vertical>
      <div class="inline-muted">
        {{ countText }}
      </div>
      <n-modal
        v-model:show="showSongSearchDialog"
        preset="card"
        :title="t('ui.songSearch')"
        display-directive="show"
        style="width: min(960px, calc(100vw - 32px));"
      >
        <div class="song-search-dialog-body">
          <song-search
            :initial-series-ids="props.initialSeriesIds"
            :performance-id="props.performanceId"
            @select="addSong"
          />
        </div>
      </n-modal>
      <div
        v-if="props.cloneHint"
        class="inline-muted"
      >
        {{ t('ui.cloneHint', { id: props.cloneHint }) }}
      </div>
      <n-form label-width="auto">
        <n-form-item :label="t('ui.labels.cloneOtherPrediction')">
          <n-space>
            <n-input
              v-model:value="clonePredictionId"
              :placeholder="t('ui.placeholders.enterPredictionId')"
              style="min-width: 220px"
              @keydown.enter.prevent="submitCloneInput"
            />
            <n-button
              v-if="model.length === 0"
              :loading="cloneLoading"
              @click="cloneFromPrediction"
            >
              <template #icon>
                <n-icon><copy-outline /></n-icon>
              </template>
              {{ t('ui.clone') }}
            </n-button>
            <n-popconfirm
              v-else
              v-model:show="showCloneReplaceConfirm"
              :positive-text="t('ui.replace')"
              :negative-text="t('ui.cancel')"
              @positive-click="cloneFromPrediction(true)"
            >
              <template #trigger>
                <n-button :loading="cloneLoading">
                  <template #icon>
                    <n-icon><copy-outline /></n-icon>
                  </template>
                  {{ t('ui.clone') }}
                </n-button>
              </template>
              {{ t('ui.cloneReplaceConfirm') }}
            </n-popconfirm>
          </n-space>
          <template
            v-if="cloneError"
            #feedback
          >
            <n-tag
              type="error"
              closable
              @close="cloneError = null"
            >
              {{ cloneError }}
            </n-tag>
          </template>
        </n-form-item>
        <n-form-item :label="t('ui.labels.textItem')">
          <n-space>
            <n-input
              v-model:value="textDraft"
              :placeholder="t('ui.placeholders.addTextItem')"
              style="min-width: 280px"
              :maxlength="200"
              show-count
              @keydown.enter.prevent="addTextItem"
            />
            <n-button @click="addTextItem">
              <template #icon>
                <n-icon><add-outline /></n-icon>
              </template>
              {{ t('ui.add') }}
            </n-button>
          </n-space>
          <template
            v-if="textError"
            #feedback
          >
            <n-tag
              type="error"
              closable
              @close="textError = null"
            >
              {{ textError }}
            </n-tag>
          </template>
        </n-form-item>
        <n-form-item
          :label="t('ui.labels.addSong')"
        >
          <n-button
            type="primary"
            @click="showSongSearchDialog = true"
          >
            <template #icon>
              <n-icon><search-outline /></n-icon>
            </template>
            {{ t('ui.action.searchSong') }}
          </n-button>
        </n-form-item>
      </n-form>

      <n-list
        v-if="model.length > 0"
        bordered
      >
        <n-list-item
          v-for="(item, index) of model"
          :key="`${item.type}-${index}-${item.songId ?? ''}`"
        >
          <div
            class="setlist-row"
            :class="{ 'setlist-row--moving-source': moveSourceIndex === index }"
          >
            <div class="setlist-title">
              <span
                class="setlist-type-icon"
                :title="item.type === 'song' ? t('ui.tooltip.songItem') : t('ui.tooltip.textItem')"
              >
                {{ item.type === 'song' ? '🎵' : '📝' }}
              </span>
              <strong v-if="item.type === 'song'">
                <n-a
                  v-if="item.songId"
                  :href="`https://ll-fans.jp/data/song/${item.songId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ item.songName }}
                </n-a>
                <span v-else>{{ item.songName }}</span>
              </strong>
              <strong v-else>{{ item.text }}</strong>
            </div>
            <n-input
              v-model:value="item.note"
              class="setlist-note"
              :placeholder="t('ui.placeholders.note')"
              size="small"
              :maxlength="100"
              show-count
            />
            <n-space class="setlist-actions">
              <template v-if="moveSourceIndex === null">
                <n-button
                  size="small"
                  @click="move(index, -1)"
                >
                  <template #icon>
                    <n-icon><arrow-up-outline /></n-icon>
                  </template>
                  {{ t('ui.up') }}
                </n-button>
                <n-button
                  size="small"
                  @click="move(index, 1)"
                >
                  <template #icon>
                    <n-icon><arrow-down-outline /></n-icon>
                  </template>
                  {{ t('ui.down') }}
                </n-button>
                <n-button
                  size="small"
                  @click="startMoveTo(index)"
                >
                  <template #icon>
                    <n-icon><swap-vertical-outline /></n-icon>
                  </template>
                  {{ t('ui.moveTo') }}
                </n-button>
              </template>
              <template v-else>
                <template v-if="moveSourceIndex !== index">
                  <n-button
                    size="small"
                    @click="moveTo(index, 'above')"
                  >
                    <template #icon>
                      <n-icon><return-up-back-outline /></n-icon>
                    </template>
                    {{ t('ui.above') }}
                  </n-button>
                  <n-button
                    size="small"
                    @click="moveTo(index, 'below')"
                  >
                    <template #icon>
                      <n-icon><return-down-forward-outline /></n-icon>
                    </template>
                    {{ t('ui.below') }}
                  </n-button>
                </template>
                <n-button
                  v-else
                  size="small"
                  @click="cancelMoveTo"
                >
                  <template #icon>
                    <n-icon><close-outline /></n-icon>
                  </template>
                  {{ t('ui.cancel') }}
                </n-button>
              </template>
              <n-popconfirm
                v-if="moveSourceIndex === null"
                :positive-text="t('ui.delete')"
                :negative-text="t('ui.cancel')"
                @positive-click="removeItem(index)"
              >
                <template #trigger>
                  <n-button
                    size="small"
                    type="error"
                  >
                    <template #icon>
                      <n-icon><trash-outline /></n-icon>
                    </template>
                    {{ t('ui.delete') }}
                  </n-button>
                </template>
                {{ t('ui.confirm.deleteSetlistItem') }}
              </n-popconfirm>
            </n-space>
          </div>
        </n-list-item>
      </n-list>
      <n-empty
        v-else
        :description="t('ui.noSetlistItemsYet')"
      />
    </n-space>
  </n-card>
</template>

<style scoped>
.setlist-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}

.setlist-row--moving-source {
  border-left: 3px solid var(--n-color-target);
  padding-left: 8px;
}

.setlist-title {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.setlist-type-icon {
  flex: 0 0 auto;
}

.setlist-note {
  width: 280px;
  flex: 0 0 auto;
}

.setlist-actions {
  flex: 0 0 auto;
}

.song-search-dialog-body {
  max-height: calc(100vh - 170px);
  overflow: auto;
}

@media (max-width: 900px) {
  .setlist-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .setlist-note {
    width: 100%;
  }

  .setlist-actions :deep(.n-button__icon) {
    display: none;
  }
}
</style>
