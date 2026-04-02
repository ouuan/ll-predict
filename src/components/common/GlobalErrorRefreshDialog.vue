<script setup lang="ts">
import { useDialog } from 'naive-ui';
import { h, onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const dialog = useDialog();
const router = useRouter();

let hasShownErrorDialog = false;
let baseHead: string | null = null;
let isCheckingHead = false;

const HEAD_PATH = '/HEAD';

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

  // eslint-disable-next-line no-console
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
          style: {
            marginTop: '8px',
            maxHeight: '200px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          },
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

async function fetchHead(): Promise<string | null> {
  try {
    const response = await fetch(HEAD_PATH, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    });
    if (!response.ok) {
      return null;
    }
    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function shouldShowUpdateDialog(): Promise<boolean> {
  if (isCheckingHead) {
    return false;
  }
  isCheckingHead = true;
  try {
    const latestHead = await fetchHead();
    if (!latestHead) {
      return false;
    }
    if (!baseHead) {
      baseHead = latestHead;
      return false;
    }
    return latestHead !== baseHead;
  } finally {
    isCheckingHead = false;
  }
}

async function tryShowRefreshDialog(error: unknown): Promise<void> {
  if (await shouldShowUpdateDialog()) {
    showRefreshDialog(error);
  }
}

async function initBaseHead(): Promise<void> {
  baseHead = await fetchHead();
}

function handleWindowError(event: Event): void {
  if (event instanceof ErrorEvent) {
    void tryShowRefreshDialog(event.error ?? event.message ?? 'Unknown runtime error');
    return;
  }

  const { target } = event;
  if (
    target instanceof HTMLScriptElement
    && target.type === 'module'
    && target.src.length > 0
  ) {
    void tryShowRefreshDialog(`Module script failed to load: ${target.src}`);
  }
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  void tryShowRefreshDialog(event.reason ?? 'Unhandled promise rejection');
}

function handleRouterError(error: Error): void {
  void tryShowRefreshDialog(error);
}

// Vue Router error handling is callback-based by API design.

const removeRouterErrorHandler = router.onError(handleRouterError);

onMounted(() => {
  void initBaseHead();
  window.addEventListener('error', handleWindowError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
});

onBeforeUnmount(() => {
  removeRouterErrorHandler();
  window.removeEventListener('error', handleWindowError, true);
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
});
</script>

<template>
  <span style="display: none;" />
</template>
