import { defineConfig, presetUno, presetIcons, presetWebFonts } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'flex-col-center': 'flex flex-col items-center justify-center',
    'w-full': 'w-full',
    'h-full': 'h-full',
    'absolute': 'absolute',
    'relative': 'relative',
  },
  theme: {
    colors: {
      primary: {
        50: '#eef2ff',
        100: '#e0e7ff',
        200: '#c7d2fe',
        300: '#a5b4fc',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
        900: '#312e81',
      },
    },
  },
  preflights: [
    {
      getCSS: () => {
        return `
          /* naive-ui 按钮样式重置 - 修复 UnoCSS preflight 将按钮背景设为 transparent 的问题 */
          .n-button {
            background-color: var(--n-color) !important;
            border-color: var(--n-border) !important;
          }
          .n-button--primary-type {
            --n-color: #6366f1 !important;
            --n-color-hover: #4f46e5 !important;
            --n-color-pressed: #4338ca !important;
            --n-border: transparent !important;
            --n-border-hover: transparent !important;
            --n-border-pressed: transparent !important;
          }
          .n-button--default-type {
            --n-color: #f3f4f6 !important;
            --n-color-hover: #e5e7eb !important;
            --n-color-pressed: #d1d5db !important;
            --n-border: #d1d5db !important;
            --n-border-hover: #6366f1 !important;
            --n-border-pressed: #4338ca !important;
          }
          .n-button--tertiary-type {
            --n-color: transparent !important;
            --n-color-hover: rgba(0, 0, 0, 0.05) !important;
            --n-color-pressed: rgba(0, 0, 0, 0.1) !important;
            --n-border: transparent !important;
            --n-border-hover: transparent !important;
            --n-border-pressed: transparent !important;
          }
          .n-button--info-type {
            --n-color: #3b82f6 !important;
            --n-color-hover: #2563eb !important;
            --n-color-pressed: #1d4ed8 !important;
          }
          .n-button--success-type {
            --n-color: #10b981 !important;
            --n-color-hover: #059669 !important;
            --n-color-pressed: #047857 !important;
          }
          .n-button--warning-type {
            --n-color: #f59e0b !important;
            --n-color-hover: #d97706 !important;
            --n-color-pressed: #b45309 !important;
          }
          .n-button--error-type {
            --n-color: #ef4444 !important;
            --n-color-hover: #dc2626 !important;
            --n-color-pressed: #b91c1c !important;
          }
        `;
      },
    },
  ],
});
