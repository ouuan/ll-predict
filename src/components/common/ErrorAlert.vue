<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  title?: string;
  message: string;
}>();

const { t } = useI18n();
</script>

<template>
  <n-alert
    type="error"
    :title="props.title ?? t('common.errorTitle')"
    style="margin-bottom: 12px"
  >
    {{ props.message }}
  </n-alert>
</template>
