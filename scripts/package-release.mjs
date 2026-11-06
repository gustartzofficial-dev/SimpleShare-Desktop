import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),pkg=JSON.parse(await readFile('package.json','utf8')),version=pkg.version;
const config=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
if(config.version!==version)throw Error('Application manifest versions disagree');
const release=process.argv.includes('--check-source')?path.join(root,'.local/qa/source-check'):path.join(root,'release',`v${version}`),full=path.join(release,'source-upload'),changed=path.join(release,'changed-files-upload');
await mkdir(full,{recursive:true});await mkdir(changed,{recursive:true});
const roots=['.github','public','scripts','src','tests','src-tauri/src','src-tauri/capabilities','src-tauri/icons'];
const files=['.gitignore','package.json','package-lock.json','index.html','audio.html','capture.html','vite.config.js','LICENSE','README.md','UPDATER_SETUP.md','RELEASE_NOTES.md','VALIDATION.md','THIRD_PARTY_NOTICES.md','THIRD_PARTY_LICENSES.txt','src-tauri/Cargo.toml','src-tauri/Cargo.lock','src-tauri/build.rs','src-tauri/tauri.conf.json'];
async function walk(relative){for(const entry of await readdir(relative,{withFileTypes:true})){const next=`${relative}/${entry.name}`;if(entry.isDirectory())await walk(next);else if(entry.isFile())files.push(next);}}
for(const directory of roots)await walk(directory);
let old=[];try{old=JSON.parse(await readFile('.local/repository-tree.json','utf8')).tree.filter(e=>e.type==='blob');}catch{}
if(!old.length)throw Error('Fetch the original repository tree before preparing its replacement');
const obsolete=old.map(e=>e.path).filter(p=>!files.includes(p));
const removal=`Remove these retired Electron files from the GitHub repository. Uploading new files does not delete them.\nDo not delete the repository or its Releases.\n\nBefore uploading, the old assets/, src/, scripts/, and tests/ folders may be removed together in github.dev, then replaced with the folders from source-upload. After uploading, delete only the paths below; do not delete the new src/ folder.\n\n${obsolete.map(p=>`DELETE ${p}`).join('\n')}\n`;
await writeFile('REMOVE_OLD_ELECTRON_FILES.txt',removal);files.push('REMOVE_OLD_ELECTRON_FILES.txt');
const hashes=[],updates=[];
for(const relative of [...new Set(files)].sort()){
 if(/(^|\/)(\.local|node_modules|target|release|dist)(\/|$)|\.key$|\.env$/i.test(relative))throw Error(`Forbidden source path: ${relative}`);
 const bytes=await readFile(relative);const sha=createHash('sha256').update(bytes).digest('hex');
 const blob=createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
 await mkdir(path.dirname(path.join(full,relative)),{recursive:true});await copyFile(relative,path.join(full,relative));
 if(old.find(e=>e.path===relative)?.sha!==blob){await mkdir(path.dirname(path.join(changed,relative)),{recursive:true});await copyFile(relative,path.join(changed,relative));updates.push(relative);}
 hashes.push(`${sha}  ${relative}`);
}
await writeFile(path.join(release,'SOURCE_SHA256SUMS.txt'),hashes.join('\n')+'\n');
await writeFile(path.join(release,'CHANGED_FILES.txt'),updates.join('\n')+'\n');
await writeFile(path.join(release,'REMOVE_OLD_ELECTRON_FILES.txt'),removal);
const target=process.env.CARGO_TARGET_DIR||path.join(root,'src-tauri/target'),installer=`SimpleShare_${version}_x64-setup.exe`,bundle=path.join(target,'x86_64-pc-windows-msvc/release/bundle/nsis');
for(const file of [installer,installer+'.sig'])await copyFile(path.join(bundle,file),path.join(release,file));
const signature=(await readFile(path.join(bundle,installer+'.sig'),'utf8')).trim();
const manifest={version,notes:`SimpleShare Desktop ${version}: native Rust Windows capture, persistent AppData profile, and signed updates.`,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature,url:`https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases/download/v${version}/${installer}`}}};
await writeFile(path.join(release,'latest.json'),JSON.stringify(manifest,null,2)+'\n');
const binary=await readFile(path.join(release,installer));await writeFile(path.join(release,'INSTALLER_SHA256SUMS.txt'),`${createHash('sha256').update(binary).digest('hex')}  ${installer}\n`);
for(const doc of ['UPDATER_SETUP.md','RELEASE_NOTES.md','VALIDATION.md'])await copyFile(doc,path.join(release,doc));
await writeFile(path.join(release,'COMMIT_MESSAGE.txt'),'Migrate desktop client to Rust/Tauri with native capture and signed updates\n');
await writeFile(path.join(release,'START_HERE.txt'),`SimpleShare Desktop v${version}\n\nInstall: ${installer}\n\nGitHub source upload: source-upload (${hashes.length} clean source files). Upload its contents at the repository root.\nChanged files only: changed-files-upload (${updates.length} files).\nDelete retired Electron files using REMOVE_OLD_ELECTRON_FILES.txt (${obsolete.length} paths). GitHub uploads do not remove them.\n\nRelease assets: ${installer}, ${installer}.sig, and latest.json.\nOne-time signing secret and publication instructions: UPDATER_SETUP.md.\nRelease description: RELEASE_NOTES.md.\nChecks and limitations: VALIDATION.md.\n\nDo not upload the working project's .local, node_modules, caches, private signing key, or test profiles. Those are excluded from these clean upload folders.\n`);
console.log(JSON.stringify({release,sourceFiles:hashes.length,changedFiles:updates.length,obsoleteFiles:obsolete.length,installerBytes:binary.length}));
