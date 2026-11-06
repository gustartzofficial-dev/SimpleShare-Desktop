import {defineConfig} from 'vite';import {resolve} from 'node:path';
export default defineConfig({clearScreen:false,server:{watch:{ignored:['**/.local/**','**/src-tauri/**','**/release/**']}},build:{rollupOptions:{input:{main:resolve(import.meta.dirname,'index.html'),audio:resolve(import.meta.dirname,'audio.html'),capture:resolve(import.meta.dirname,'capture.html')}}}});
