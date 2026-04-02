<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { SettingsOutline } from '@vicons/ionicons5';
import { usePreferredDark, useStorage } from '@vueuse/core';
import { darkTheme } from 'naive-ui';
import { computed, ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import GlobalErrorRefreshDialog from './components/common/GlobalErrorRefreshDialog.vue';
import LanguageSwitcher from './components/common/LanguageSwitcher.vue';
import { useNetworkStatus } from './composables/useNetworkStatus';
import {
  DATA_SOURCE_URL, REPOSITORY_URL, SITE_DESCRIPTION, SITE_URL,
} from './constants/site';

const route = useRoute();
const { isOnline } = useNetworkStatus();
const { t } = useI18n();
const showSettingsModal = ref(false);

type ThemeMode = 'light' | 'dark' | 'system';

const themeMode = useStorage<ThemeMode>('ll-predict-theme-mode', 'system');
const prefersDark = usePreferredDark();
const isDarkMode = computed(() =>
  themeMode.value === 'dark'
  || (themeMode.value === 'system' && prefersDark.value));
const naiveTheme = computed(() => (isDarkMode.value ? darkTheme : null));

const themeModeOptions = computed(() => [
  { label: t('common.themeLight'), value: 'light' },
  { label: t('common.themeDark'), value: 'dark' },
  { label: t('common.themeSystem'), value: 'system' },
]);

watchEffect(() => {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.classList.toggle('app-dark', isDarkMode.value);
});

const navItems = computed(() => [
  { name: t('app.navTours'), to: '/' },
  { name: t('app.navMyPredictions'), to: '/predictions' },
]);

const pageTitle = computed(() => {
  if (route.name === 'tour-list') return t('app.pageTitle.tourList');
  if (route.name === 'tour-detail') return t('app.pageTitle.tourDetail');
  if (route.name === 'predict-submit') return t('app.pageTitle.predictSubmit');
  if (route.name === 'tour-predictions') return t('app.pageTitle.predictionList');
  if (route.name === 'tour-predictions-by-performance') return t('app.pageTitle.predictionList');
  if (route.name === 'prediction-detail') return t('app.pageTitle.predictionDetail');
  if (route.name === 'performance-top-songs') return t('app.pageTitle.topSongs');
  if (route.name === 'all-predictions') return t('app.pageTitle.myPredictions');
  return t('app.pageTitle.default');
});

const documentTitle = computed(() => `${pageTitle.value} - ${t('app.name')}`);
const canonicalUrl = computed(() => {
  const path = route.fullPath.split('#')[0] ?? '/';
  return new URL(path, SITE_URL).toString();
});

useHead(computed(() => ({
  title: documentTitle.value,
  meta: [
    { name: 'description', content: SITE_DESCRIPTION },
    { property: 'og:title', content: documentTitle.value },
    { property: 'og:description', content: SITE_DESCRIPTION },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonicalUrl.value },
  ],
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
  ],
})));
</script>

<template>
  <n-config-provider :theme="naiveTheme">
    <n-dialog-provider>
      <n-message-provider>
        <global-error-refresh-dialog />
        <n-layout class="app-layout">
          <n-layout-header
            class="app-header"
            bordered
          >
            <div class="app-header-inner">
              <router-link
                to="/"
                class="brand"
              >
                {{ t('app.name') }}
              </router-link>
              <n-space align="center">
                <router-link
                  v-for="item of navItems"
                  :key="item.to"
                  :to="item.to"
                  class="nav-link"
                >
                  {{ item.name }}
                </router-link>
                <n-button
                  quaternary
                  circle
                  :title="t('common.settings')"
                  @click="showSettingsModal = true"
                >
                  <n-icon>
                    <settings-outline />
                  </n-icon>
                </n-button>
              </n-space>
            </div>
          </n-layout-header>
          <n-layout-content
            class="app-content"
            content-style="padding: 20px;"
          >
            <div class="page-shell">
              <n-alert
                v-if="!isOnline"
                type="warning"
                :title="t('app.offlineTitle')"
                style="margin-bottom: 12px"
              >
                {{ t('app.offlineMessage') }}
              </n-alert>
              <h1 class="page-title">
                {{ pageTitle }}
              </h1>
              <router-view />
            </div>
          </n-layout-content>
          <n-layout-footer
            bordered
            class="app-footer"
          >
            <div class="app-footer-inner">
              <span>
                {{ t('app.footer.repository') }}:
                <a
                  :href="REPOSITORY_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </span>
              <span
                class="app-footer-separator"
                aria-hidden="true"
              >
                |
              </span>
              <span>
                {{ t('app.footer.dataSource') }}:
                <a
                  :href="DATA_SOURCE_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ t('app.footer.llFans') }}
                </a>
              </span>
            </div>
          </n-layout-footer>
        </n-layout>
        <n-modal v-model:show="showSettingsModal">
          <n-card
            :title="t('common.settings')"
            style="width: 360px"
            :bordered="false"
            role="dialog"
            aria-modal="true"
          >
            <n-space vertical>
              <div>{{ t('common.language') }}</div>
              <language-switcher />
              <div>{{ t('common.themeMode') }}</div>
              <n-select
                v-model:value="themeMode"
                :options="themeModeOptions"
              />
            </n-space>
          </n-card>
        </n-modal>
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
