<script setup lang="ts">
import { useHead } from '@unhead/vue';
import {
  AddOutline,
  ArrowBackOutline,
  CheckmarkOutline,
  ThumbsDownOutline,
  ThumbsUpOutline,
} from '@vicons/ionicons5';
import { useMessage } from 'naive-ui';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import ErrorAlert from '../components/common/ErrorAlert.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import SongSearch from '../components/predict/SongSearch.vue';
import { api } from '../composables/useApi';
import type {
  PerformanceDetail,
  SingleSongPredictionItem,
  SongItem,
  TourListItem,
} from '../types/domain';

const route = useRoute();
const message = useMessage();
const { t } = useI18n();

const performanceId = computed(() => String(route.params.performanceId ?? ''));
const tourId = computed(() => String(route.params.tourId ?? ''));
const loading = ref(false);
const votingSongId = ref<string | null>(null);
const nominating = ref(false);
const items = ref<SingleSongPredictionItem[]>([]);
const errorMessage = ref('');
const showSongSearchDialog = ref(false);
const tour = ref<TourListItem | null>(null);
const performanceDetail = ref<PerformanceDetail | null>(null);

const nominatedSongIds = computed(() => items.value.map((item) => item.songId));
const initialSeriesIds = computed(() => tour.value?.seriesIds ?? []);
const selectedConcertName = computed(() => {
  if (!tour.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    if (concert.performances.some((performance) => performance.id === performanceId.value)) {
      return concert.name;
    }
  }

  return '';
});
const selectedPerformanceName = computed(() => {
  if (!tour.value) {
    return '';
  }

  for (const concert of tour.value.concerts) {
    const performance = concert.performances.find((item) => item.id === performanceId.value);
    if (performance) {
      return performance.name;
    }
  }

  return '';
});
const contextTitle = computed(() => {
  if (!tour.value) {
    return '';
  }

  const parts = [tour.value.name];

  if (selectedConcertName.value) {
    parts.push(selectedConcertName.value);
  }
  if (selectedPerformanceName.value) {
    parts.push(selectedPerformanceName.value);
  }

  return parts.join(' ');
});

const submissionClosed = computed(() => {
  if (!tour.value) {
    return false;
  }

  const cutoff = Date.parse(`${tour.value.startsOn}T00:00:00+09:00`);
  if (!Number.isFinite(cutoff)) {
    return false;
  }

  return Date.now() >= cutoff;
});

const pageDocumentTitle = computed(() => {
  const parts: string[] = [];

  parts.push(t('app.pageTitle.songPredictions'));

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

function toVoteRatios(willSingCount: number, wontSingCount: number) {
  const total = willSingCount + wontSingCount;
  return {
    willSingRatio: total === 0 ? 0 : Math.round((willSingCount / total) * 10000) / 100,
    wontSingRatio: total === 0 ? 0 : Math.round((wontSingCount / total) * 10000) / 100,
  };
}

function applyVoteLocally(songId: string, nextVote: 'will_sing' | 'wont_sing' | null) {
  items.value = items.value.map((item) => {
    if (item.songId !== songId) {
      return item;
    }

    let { willSingCount, wontSingCount }: {
      willSingCount: number;
      wontSingCount: number;
    } = item;

    if (item.myVote === 'will_sing') {
      willSingCount = Math.max(0, willSingCount - 1);
    } else if (item.myVote === 'wont_sing') {
      wontSingCount = Math.max(0, wontSingCount - 1);
    }

    if (nextVote === 'will_sing') {
      willSingCount += 1;
    } else if (nextVote === 'wont_sing') {
      wontSingCount += 1;
    }

    return {
      ...item,
      willSingCount,
      wontSingCount,
      ...toVoteRatios(willSingCount, wontSingCount),
      myVote: nextVote,
    };
  });
}

function songWasSungInActualSetlist(songId: string): boolean {
  if (!performanceDetail.value) {
    return false;
  }
  return performanceDetail.value.setlists.some(
    (item) => item.contentType === 'song' && item.song?.id === songId,
  );
}

async function fetchTour() {
  try {
    const res = await api.getTourDetail(tourId.value);
    tour.value = res.data;
  } catch {
    tour.value = null;
  }
}

async function fetchPerformanceDetail() {
  try {
    const res = await api.getPerformanceDetail(performanceId.value);
    performanceDetail.value = res.data;
  } catch {
    performanceDetail.value = null;
  }
}

async function fetchSingleSongPredictions() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.getSingleSongPredictions(performanceId.value);
    items.value = res.data.items;
  } catch (error) {
    const msg = (error as Error).message;
    errorMessage.value = msg;
    message.error(msg);
  } finally {
    loading.value = false;
  }
}

async function nominateSong(song: SongItem) {
  if (submissionClosed.value) {
    return;
  }

  nominating.value = true;
  try {
    await api.nominateSong(performanceId.value, {
      tourId: tourId.value,
      songId: song.id,
    });
    message.success(t('feedback.songNominated', { name: song.name }));
    showSongSearchDialog.value = false;
    await fetchSingleSongPredictions();
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    nominating.value = false;
  }
}

async function voteSong(song: SingleSongPredictionItem, vote: 'will_sing' | 'wont_sing') {
  if (submissionClosed.value) {
    return;
  }

  votingSongId.value = song.songId;
  try {
    const nextVote = song.myVote === vote ? null : vote;

    if (nextVote === null) {
      await api.deleteSingleSongVote(performanceId.value, {
        tourId: tourId.value,
        songId: song.songId,
      });
    } else {
      await api.voteSingleSong(performanceId.value, {
        tourId: tourId.value,
        songId: song.songId,
        vote: nextVote,
      });
    }

    applyVoteLocally(song.songId, nextVote);
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    votingSongId.value = null;
  }
}

onMounted(() => {
  void fetchTour();
  void fetchSingleSongPredictions();
  void fetchPerformanceDetail();
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
        align="center"
        justify="space-between"
      >
        <n-space align="center">
          <router-link :to="`/tours/${tourId}`">
            <n-button size="small">
              <template #icon>
                <n-icon><arrow-back-outline /></n-icon>
              </template>
              {{ t('ui.tourDetail') }}
            </n-button>
          </router-link>
          <strong v-if="contextTitle">
            {{ contextTitle }}
          </strong>
        </n-space>

        <n-space align="center">
          <n-tag
            v-if="submissionClosed"
            type="error"
          >
            {{ t('ui.submissionClosed') }}
          </n-tag>
          <n-button
            v-else
            secondary
            type="primary"
            :loading="nominating"
            @click="showSongSearchDialog = true"
          >
            <template #icon>
              <n-icon><add-outline /></n-icon>
            </template>
            {{ t('ui.nominateSong') }}
          </n-button>
        </n-space>
      </n-space>
    </n-card>

    <song-search
      v-model:show="showSongSearchDialog"
      :initial-series-ids="initialSeriesIds"
      :performance-id="performanceId"
      :hide-top-songs-switch="true"
      :disabled-song-ids="nominatedSongIds"
      @select="nominateSong"
    />

    <loading-spinner :show="loading">
      <n-list
        v-if="items.length > 0"
        bordered
      >
        <n-list-item
          v-for="song of items"
          :key="song.songId"
        >
          <n-space
            justify="space-between"
            align="center"
            style="width: 100%"
            wrap
          >
            <n-a
              :href="`https://ll-fans.jp/data/song/${song.songId}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              <strong>{{ song.songName }}</strong>
            </n-a>

            <n-space size="small">
              <template v-if="submissionClosed">
                <n-tag
                  type="success"
                  :strong="song.myVote === 'will_sing'"
                  :bordered="song.myVote === 'will_sing'"
                >
                  <template #icon>
                    <n-icon v-if="songWasSungInActualSetlist(song.songId)">
                      <checkmark-outline />
                    </n-icon>
                  </template>
                  {{
                    t('ui.voteWillSing', {
                      count: song.willSingCount,
                      ratio: song.willSingRatio,
                    })
                  }}
                </n-tag>
                <n-tag
                  type="error"
                  :strong="song.myVote === 'wont_sing'"
                  :bordered="song.myVote === 'wont_sing'"
                >
                  <template #icon>
                    <n-icon v-if="!songWasSungInActualSetlist(song.songId)">
                      <checkmark-outline />
                    </n-icon>
                  </template>
                  {{
                    t('ui.voteWontSing', {
                      count: song.wontSingCount,
                      ratio: song.wontSingRatio,
                    })
                  }}
                </n-tag>
              </template>
              <template v-else>
                <n-button
                  class="vote-button"
                  :type="song.myVote === 'will_sing' ? 'primary' : 'default'"
                  :loading="votingSongId === song.songId"
                  size="small"
                  @click="voteSong(song, 'will_sing')"
                >
                  <template #icon>
                    <n-icon><thumbs-up-outline /></n-icon>
                  </template>
                  {{
                    t('ui.voteWillSing', {
                      count: song.willSingCount,
                      ratio: song.willSingRatio,
                    })
                  }}
                </n-button>
                <n-button
                  class="vote-button"
                  :type="song.myVote === 'wont_sing' ? 'error' : 'default'"
                  :loading="votingSongId === song.songId"
                  size="small"
                  @click="voteSong(song, 'wont_sing')"
                >
                  <template #icon>
                    <n-icon><thumbs-down-outline /></n-icon>
                  </template>
                  {{
                    t('ui.voteWontSing', {
                      count: song.wontSingCount,
                      ratio: song.wontSingRatio,
                    })
                  }}
                </n-button>
              </template>
            </n-space>
          </n-space>
        </n-list-item>
      </n-list>
      <n-empty
        v-else
        :description="t('ui.noSongNominationsYet')"
      />
    </loading-spinner>
  </n-space>
</template>

<style scoped>
@media (max-width: 640px) {
  .vote-button :deep(.n-button__icon) {
    display: none;
  }
}
</style>
