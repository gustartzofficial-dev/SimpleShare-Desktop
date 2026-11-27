import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),version=JSON.parse(await readFile('package.json','utf8')).version;
const args=process.argv.slice(2),baselineArg=args.indexOf('--baseline');
const baseline=baselineArg>=0?JSON.parse(await readFile(args[baselineArg+1],'utf8')):null;
const release=path.join(root,'release',`v${version}`);await mkdir(release,{recursive:true});
const files=[];
for(const name of ['.gitignore','.gitattributes','package.json','package-lock.json','index.html','installer.html','audio.html','capture.html','vite.config.js','LICENSE','README.md','UPDATER_SETUP.md','RELEASE_NOTES.md','VALIDATION.md','THIRD_PARTY_NOTICES.md','THIRD_PARTY_LICENSES.txt','Install-SimpleShare.sh','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/build.rs','src-tauri/tauri.conf.json','src-tauri/tauri.linux.conf.json'])files.push(name);
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(entry.isFile())files.push(file);}}
for(const dir of ['.github','public','scripts','src','tests','src-tauri/src','src-tauri/capabilities','src-tauri/icons','src-tauri/installer'])await walk(dir);
const changed=[],hashes=[];
for(const file of [...new Set(files)].sort()){
 if(/(^|\/)(\.local|node_modules|target|dist|release|gen)(\/|$)|\.key$|(^|\/)\.env($|\.)/.test(file))throw Error('Unsafe source path '+file);
 const bytes=await readFile(file),sha=createHash('sha256').update(bytes).digest('hex');
 for(const folder of ['source-upload',...(!baseline||baseline[file]!==sha?['changed-files-upload']:[])]){const dest=path.join(release,folder,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(file,dest);}
 if(!baseline||baseline[file]!==sha)changed.push(file);
 hashes.push(sha+'  '+file);
}
await writeFile(path.join(release,'CHANGED_FILES.txt'),changed.join('\n')+'\n');
await writeFile(path.join(release,'SOURCE_SHA256SUMS.txt'),hashes.join('\n')+'\n');
await writeFile(path.join(release,'COMMIT_MESSAGE.txt'),'Add audio-only source controls, branded installers and Linux desktop support\n');
for(const name of ['RELEASE_NOTES.md','UPDATER_SETUP.md','VALIDATION.md'])await copyFile(name,path.join(release,name));
console.log(JSON.stringify({release,sourceFiles:hashes.length,changedFiles:changed.length,baseline:baseline?'provided':'all source included'}));
