import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import i18n, { setLocale } from "./i18n";
import { useSettingsStore } from "@/stores/settings.store";
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";
import "./styles/global.css";
// 通用字体
import "vfonts/Lato.css";
// 等宽字体
import "vfonts/FiraCode.css";

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

  const meta = document.createElement("meta");
  meta.name = "naive-ui-style";
  document.head.appendChild(meta);

  app.mount("#app");
});
