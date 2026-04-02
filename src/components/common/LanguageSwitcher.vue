<script setup lang="ts">
import { computed } from 'vue';
import { getLocale, setLocale, type SupportedLocale } from '../../i18n';

const model = computed<SupportedLocale>({
  get() {
    return getLocale();
  },
  set(value) {
    setLocale(value);
  },
});

const options = [
  { label: 'English', value: 'en' },
  { label: '中文', value: 'zh' },
  { label: '日本語', value: 'ja' },
] as const;
</script>

<template>
  <n-select
    v-model:value="model"
    size="small"
    :options="options"
    style="width: 120px"
  />
</template>
