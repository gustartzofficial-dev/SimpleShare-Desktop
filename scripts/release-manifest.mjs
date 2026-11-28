import {readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
const version=JSON.parse(await readFile('package.json','utf8')).version;
const directory=args.includes('--assets')?option('--assets'):`release/v${version}`;
const tag=args.includes('--tag')?option('--tag'):`v${version}`;
if(!/^[A-Za-z0-9._-]+$/.test(tag))throw Error('Release tag contains unsupported characters');
const files=await readdir(directory),platforms={};
const windows=`SimpleShare_${version}_x64-setup.exe`;
const linux=files.find(f=>f.endsWith('.AppImage')&&f.includes(`_${version}_`));
for(const [platform,file]of [['windows-x86_64',windows],['linux-x86_64',linux]]){
 if(!file||!files.includes(file)){if(platform==='windows-x86_64'||args.includes('--require-linux'))throw Error(`Missing ${platform} installer`);continue;}
 const signature=(await readFile(path.join(directory,file+'.sig'),'utf8')).trim();
 if(!signature)throw Error(`Missing signature for ${file}`);
 platforms[platform]={signature,url:`https://github.com/gustartzofficial-dev/SimpleShare-Desktop/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(file)}`};
}
await writeFile(path.join(directory,'latest.json'),JSON.stringify({version,notes:'Audio source controls, dedicated application audio and branded desktop installers.',pub_date:new Date().toISOString(),platforms},null,2)+'\n');
const sums=[];for(const file of files.filter(f=>/\.(exe|AppImage|deb)$/.test(f)).sort())sums.push(createHash('sha256').update(await readFile(path.join(directory,file))).digest('hex')+'  '+file);
await writeFile(path.join(directory,'INSTALLER_SHA256SUMS.txt'),sums.join('\n')+'\n');
console.log(`Manifest uses exact release tag ${tag}; platforms: ${Object.keys(platforms).join(', ')}`);
