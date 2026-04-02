import { createHead } from '@unhead/vue/client';
import {
  NA,
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NDataTable,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NList,
  NListItem,
  NMessageProvider,
  NModal,
  NPagination,
  NPopconfirm,
  NPopselect,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NThing,
  NTime,
  NTimeline,
  NTimelineItem,
  create,
} from 'naive-ui';
import { createApp } from 'vue';

import App from './App.vue';
import { i18n } from './i18n';
import { router } from './router';
import './styles.css';

const naive = create({
  components: [
    NA,
    NAlert,
    NButton,
    NCard,
    NConfigProvider,
    NDataTable,
    NEmpty,
    NForm,
    NFormItem,
    NInput,
    NInputNumber,
    NIcon,
    NLayout,
    NLayoutContent,
    NLayoutHeader,
    NList,
    NListItem,
    NMessageProvider,
    NModal,
    NPagination,
    NPopconfirm,
    NPopselect,
    NSelect,
    NSpace,
    NSpin,
    NSwitch,
    NTag,
    NThing,
    NTime,
    NTimeline,
    NTimelineItem,
  ],
});

const app = createApp(App);
app.use(createHead());
app.use(i18n);
app.use(naive);
app.use(router);
app.mount('#app');
