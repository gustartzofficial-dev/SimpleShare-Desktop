import {build} from 'esbuild';import {build as viteBuild} from 'vite';import {mkdir} from 'node:fs/promises';import './licenses.mjs';
await mkdir('src-tauri/gen',{recursive:true});await build({entryPoints:['src/native/live.js'],outfile:'src-tauri/gen/live.js',bundle:true,format:'iife',target:'es2022',minify:false});await viteBuild();
