import { createRouter, createWebHashHistory } from 'vue-router';
import HomePage from '@/pages/home/HomePage.vue';
import MainLayout from '@/pages/layout/MainLayout.vue';
import SettingsPage from '@/pages/settings/SettingsPage.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/project/:id',
      name: 'project',
      component: MainLayout,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
    },
  ],
});

export default router;
