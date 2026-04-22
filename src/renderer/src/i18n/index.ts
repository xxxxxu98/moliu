import { createI18n } from 'vue-i18n';
import zhCN from '@/locales/zh-CN.json';
import enUS from '@/locales/en-US.json';

export type LocaleType = 'zh-CN' | 'en-US';

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages,
});

export function setLocale(locale: LocaleType) {
  i18n.global.locale.value = locale;
  document.documentElement.setAttribute('lang', locale);
}

export default i18n;
