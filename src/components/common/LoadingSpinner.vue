<script setup lang="ts">
const props = defineProps<{
  show: boolean;
}>();
</script>

<template>
  <n-spin :show="props.show">
    <slot />
  </n-spin>
</template>
