import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': 'http://127.0.0.1:3000' } }, build: { outDir: 'dist', sourcemap: false }, define: { __APP_VERSION__: JSON.stringify('0.1.0'), __BUILD_TIME__: JSON.stringify(process.env.FLEET_BUILD_TIME || '') } });

