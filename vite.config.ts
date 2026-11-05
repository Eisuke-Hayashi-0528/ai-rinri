import { defineConfig } from 'vite';

export default defineConfig({
  // 公開先のどのフォルダに置いても動くように、相対パスで書き出す
  base: './',
  server: {
    // 同じWi-Fiのスマホ・タブレットから開けるようにする
    host: true,
    port: 5173,
  },
});
