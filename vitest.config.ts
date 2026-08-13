import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    // happy-dom 会对跨域 fetch 先发 CORS 预检；真实 AI 冒烟直连厂商网关（部分网关如
    // opencode.ai 对 OPTIONS 返回 404），预检失败会被判成 NetworkError。生产是 Electron
    // 渲染进程，不走浏览器预检，这里关掉同源策略以对齐真实运行环境。
    environmentOptions: {
      happyDOM: {
        settings: {
          fetch: { disableSameOriginPolicy: true },
        },
      },
    },
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'src/**/prompt-builder.ts',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
})
