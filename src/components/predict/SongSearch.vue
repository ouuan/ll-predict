<script setup lang="ts">
import { AddOutline } from '@vicons/ionicons5';
import { watchDebounced } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../../composables/useApi';
import { useArtistVariants } from '../../composables/useArtistVariants';
import type { SongItem, TopSongItem } from '../../types/domain';
import { getSeriesOptions } from '../../utils/series';

const props = defineProps<{
  initialSeriesIds: string[];
  performanceId?: string;
}>();

const emit = defineEmits<{
  select: [song: SongItem];
}>();
const { t, locale } = useI18n();

const query = ref('');
const loading = ref(false);
const songs = ref<SongItem[]>([]);
const page = ref(1);
const pageSize = ref(10);
const total = ref(0);
const seriesIds = ref(props.initialSeriesIds);
const showTopSongs = ref(false);
const topSongsLoading = ref(false);
const topSongs = ref<TopSongItem[]>([]);

const seriesOptions = computed(() => getSeriesOptions(locale.value));
const { getDisplayName, refreshIfMissing } = useArtistVariants();

watch(
  () => props.initialSeriesIds,
  (val) => {
    seriesIds.value = val;
  },
);

function onSearchConditionChanged() {
  if (showTopSongs.value) {
    return;
  }

  if (page.value !== 1) {
    page.value = 1;
    return;
  }

  void search();
}

watchDebounced(query, onSearchConditionChanged, { debounce: 300 });
watch(() => seriesIds.value.join(','), onSearchConditionChanged);

async function search() {
  loading.value = true;
  try {
    const res = await api.searchSongs({
      search: query.value,
      seriesIds: seriesIds.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    songs.value = res.data.items;
    total.value = res.data.total;
    const allArtistIds = songs.value.flatMap((s) => s.artistVariantIds);
    void refreshIfMissing(allArtistIds);
  } catch {
    songs.value = [];
    total.value = 0;
  } finally {
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value));
    page.value = Math.min(page.value, maxPage);
    loading.value = false;
  }
}

async function fetchTopSongs() {
  if (!props.performanceId) {
    topSongs.value = [];
    return;
  }

  topSongsLoading.value = true;
  try {
    const res = await api.getTopSongs(props.performanceId);
    topSongs.value = res.data.items;
  } catch {
    topSongs.value = [];
  } finally {
    topSongsLoading.value = false;
  }
}

function addTopSong(song: TopSongItem) {
  const songItem: SongItem = {
    id: song.songId,
    name: song.songName,
    seriesIds: [],
    releasedOn: null,
    artistVariantIds: [],
  };
  addSong(songItem);
}

function addSong(song: SongItem) {
  emit('select', song);
}

watch(
  [page, pageSize],
  () => {
    if (showTopSongs.value) {
      return;
    }
    void search();
  },
  { immediate: true },
);

watch(
  showTopSongs,
  (enabled) => {
    if (enabled) {
      if (props.performanceId) {
        void fetchTopSongs();
      } else {
        topSongs.value = [];
      }
      return;
    }

    if (page.value !== 1) {
      page.value = 1;
      return;
    }

    void search();
  },
  { immediate: true },
);

watch(() => props.performanceId, () => {
  if (showTopSongs.value) {
    void fetchTopSongs();
  }
});

defineExpose({
  search,
});
</script>

<template>
  <n-card
    :title="t('ui.songSearch')"
    size="small"
    class="card-gap"
  >
    <n-space vertical>
      <n-space align="center">
        <span>{{ t('ui.showTopSongs') }}</span>
        <n-switch
          v-model:value="showTopSongs"
          :disabled="!props.performanceId"
        />
      </n-space>
      <n-input
        v-model:value="query"
        :placeholder="t('ui.placeholders.songKeyword')"
      />
      <n-select
        v-model:value="seriesIds"
        :options="seriesOptions"
        :placeholder="t('ui.placeholders.selectSeries')"
        multiple
        clearable
        filterable
      />
      <n-spin :show="showTopSongs ? topSongsLoading : loading">
        <n-list
          v-if="showTopSongs && topSongs.length > 0"
          bordered
        >
          <n-list-item
            v-for="song of topSongs"
            :key="song.songId"
          >
            <n-space
              size="small"
              align="center"
              justify="space-between"
              style="width: 100%"
            >
              <n-space
                size="small"
                align="center"
              >
                <n-button
                  size="small"
                  circle
                  :title="t('ui.add')"
                  @click="addTopSong(song)"
                >
                  <template #icon>
                    <n-icon><add-outline /></n-icon>
                  </template>
                </n-button>
                <n-a
                  :href="`https://ll-fans.jp/data/song/${song.songId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{{ song.songName }}</strong>
                </n-a>
              </n-space>
              <n-space
                size="small"
                style="margin-top: 4px"
              >
                <n-tag>{{ t('ui.predictionsCount', { count: song.count }) }}</n-tag>
                <n-tag type="info">
                  {{ song.ratio }}%
                </n-tag>
              </n-space>
            </n-space>
          </n-list-item>
        </n-list>
        <n-list
          v-else-if="songs.length > 0"
          bordered
        >
          <n-list-item
            v-for="song of songs"
            :key="song.id"
          >
            <n-space
              align="center"
              justify="space-between"
              style="width: 100%"
            >
              <n-space
                align="center"
                size="small"
                style="flex: 1; min-width: 0"
              >
                <n-button
                  size="small"
                  circle
                  :title="t('ui.add')"
                  @click="addSong(song)"
                >
                  <template #icon>
                    <n-icon><add-outline /></n-icon>
                  </template>
                </n-button>
                <n-a
                  :href="`https://ll-fans.jp/data/song/${song.id}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{{ song.name }}</strong>
                </n-a>
                <span
                  v-if="song.artistVariantIds.length > 0"
                  class="inline-muted"
                >
                  {{ song.artistVariantIds.map(getDisplayName).join(' / ') }}
                </span>
              </n-space>

              <span
                v-if="song.releasedOn"
                class="inline-muted song-date"
              >
                {{ song.releasedOn }}
              </span>
            </n-space>
          </n-list-item>
        </n-list>
        <n-empty
          v-else
          :description="showTopSongs ? t('ui.noTopSongsYet') : t('ui.noSongsFound')"
        />
      </n-spin>
      <n-pagination
        v-if="!showTopSongs"
        v-model:page="page"
        v-model:page-size="pageSize"
        :item-count="total"
        show-size-picker
        :page-sizes="[10, 20, 50]"
      />
    </n-space>
  </n-card>
</template>

<style scoped>
@media (max-width: 640px) {
  .song-date {
    display: none;
  }
}
</style>
