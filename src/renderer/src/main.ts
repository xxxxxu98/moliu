import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import i18n, { setLocale } from './i18n';
import { useSettingsStore } from '@/stores/settings.store';
import 'virtual:uno.css';
import '@unocss/reset/tailwind.css';
import './styles/global.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

// Initialize settings before mounting
const settingsStore = useSettingsStore();
settingsStore.initializeSettings().then(() => {
  // Apply saved locale
  setLocale(settingsStore.locale);
  app.mount('#app');
});
