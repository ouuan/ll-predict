<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { ArrowBackOutline } from '@vicons/ionicons5';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const pageDocumentTitle = computed(() => [
  t('ui.pageNotFound'),
  t('app.name'),
].join(' - '));

useHead(computed(() => ({
  title: pageDocumentTitle.value,
  meta: [
    { property: 'og:title', content: pageDocumentTitle.value },
  ],
})));
</script>

<template>
  <n-card>
    <n-space vertical>
      <h2 style="margin: 0">
        404
      </h2>
      <div class="inline-muted">
        {{ t('ui.pageNotFound') }}
      </div>
      <router-link to="/">
        <n-button type="primary">
          <template #icon>
            <n-icon><arrow-back-outline /></n-icon>
          </template>
          {{ t('ui.backToTours') }}
        </n-button>
      </router-link>
    </n-space>
  </n-card>
</template>
