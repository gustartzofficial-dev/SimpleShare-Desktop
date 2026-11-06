import {context} from 'esbuild';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
await mkdir('src-tauri/gen',{recursive:true});
const bridge=await context({entryPoints:['src/native/live.js'],outfile:'src-tauri/gen/live.js',bundle:true,format:'iife',target:'es2022'});
await bridge.watch();
const server=await createServer({server:{host:'127.0.0.1',port:1420,strictPort:true}});
await server.listen();server.printUrls();
