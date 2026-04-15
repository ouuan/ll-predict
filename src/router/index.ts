import { createRouter, createWebHistory } from 'vue-router';

const AllPredictionsPage = () => import('../pages/AllPredictions.vue');
const NotFoundPage = () => import('../pages/NotFound.vue');
const PerformanceSongPredictionsPage = () => import('../pages/PerformanceSongPredictions.vue');
const PerformanceTopSongsPage = () => import('../pages/PerformanceTopSongs.vue');
const PredictSubmitPage = () => import('../pages/PredictSubmit.vue');
const PredictionDetailPage = () => import('../pages/PredictionDetail.vue');
const TourPredictionsPage = () => import('../pages/TourPredictions.vue');
const TourDetailPage = () => import('../pages/TourDetail.vue');
const TourListPage = () => import('../pages/TourList.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'tour-list', component: TourListPage },
    { path: '/tours/:tourId', name: 'tour-detail', component: TourDetailPage },
    {
      path: '/tours/:tourId/performances/:performanceId/predict',
      name: 'predict-submit',
      component: PredictSubmitPage,
    },
    {
      path: '/tours/:tourId/predictions',
      name: 'tour-predictions',
      component: TourPredictionsPage,
    },
    {
      path: '/tours/:tourId/performances/:performanceId/predictions',
      name: 'tour-predictions-by-performance',
      component: TourPredictionsPage,
    },
    {
      path: '/tours/:tourId/performances/:performanceId/top-songs',
      name: 'performance-top-songs',
      component: PerformanceTopSongsPage,
    },
    {
      path: '/tours/:tourId/performances/:performanceId/song-predictions',
      name: 'performance-song-predictions',
      component: PerformanceSongPredictionsPage,
    },
    { path: '/predictions', name: 'all-predictions', component: AllPredictionsPage },
    { path: '/predictions/:id', name: 'prediction-detail', component: PredictionDetailPage },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
});
