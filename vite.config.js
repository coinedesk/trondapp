// vite.config.js

import { defineConfig } from 'vite';

export default defineConfig({
  // 🚨 關鍵修復：將 base 更改為您的實際倉庫名稱 🚨
  base: '/tron20/', 
  
  // 保持 Rollup 配置不變
  build: {
    rollupOptions: {
      external: [
        /^node:/,
        'path',
        'fs',
        'http',
        'https',
        'tron-web-walletconnect' 
      ],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});