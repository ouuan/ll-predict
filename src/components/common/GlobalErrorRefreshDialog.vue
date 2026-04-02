<script setup lang="ts">
import { useDialog } from 'naive-ui';
import { h, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const dialog = useDialog();
const router = useRouter();

let hasShownErrorDialog = false;

function stringifyError(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function showRefreshDialog(error: unknown): void {
  if (hasShownErrorDialog) {
    return;
  }
  hasShownErrorDialog = true;

  console.error(error);
  const details = stringifyError(error);
  dialog.warning({
    title: t('common.updateDialogTitle'),
    positiveText: t('common.updateDialogRefresh'),
    negativeText: t('ui.cancel'),
    maskClosable: false,
    closable: false,
    content: () => h('div', [
      h('p', { style: 'margin: 0 0 8px 0;' }, t('common.updateDialogMessage')),
      h('details', { style: 'font-size: 12px;' }, [
        h('summary', { style: 'cursor: pointer;' }, t('common.updateDialogDetails')),
        h('pre', {
          style: 'margin-top: 8px; max-height: 200px; overflow: auto; white-space: pre-wrap; word-break: break-all;',
        }, details),
      ]),
    ]),
    onPositiveClick: () => {
      window.location.reload();
    },
    onNegativeClick: () => {
      hasShownErrorDialog = false;
    },
    onClose: () => {
      hasShownErrorDialog = false;
    },
  });
}

function handleWindowError(event: Event): void {
  if (event instanceof ErrorEvent) {
    showRefreshDialog(event.error ?? event.message ?? 'Unknown runtime error');
    return;
  }

  const { target } = event;
  if (
    target instanceof HTMLScriptElement
    && target.type === 'module'
    && target.src.length > 0
  ) {
    showRefreshDialog(`Module script failed to load: ${target.src}`);
  }
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  event.preventDefault();
  showRefreshDialog(event.reason ?? 'Unhandled promise rejection');
}

const removeRouterErrorHandler = router.onError((error) => {
  showRefreshDialog(error);
});

onMounted(() => {
  window.addEventListener('error', handleWindowError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
});

onBeforeUnmount(() => {
  removeRouterErrorHandler();
  window.removeEventListener('error', handleWindowError, true);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
});
</script>

<template />
