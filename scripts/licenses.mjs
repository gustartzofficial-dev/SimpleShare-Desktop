import {execFileSync} from 'node:child_process';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const metadata=JSON.parse(execFileSync('cargo',['metadata','--locked','--format-version','1','--filter-platform','x86_64-pc-windows-msvc','--manifest-path','src-tauri/Cargo.toml'],{encoding:'utf8',maxBuffer:32*1024*1024}));
const sections=['SimpleShare Desktop — third-party source license notices\nGenerated from the locked Windows dependency graph. Dependencies keep their own licenses.\n'];
for(const pkg of metadata.packages.filter(p=>p.source).sort((a,b)=>a.name.localeCompare(b.name))){
 const dir=path.dirname(pkg.manifest_path),names=(await readdir(dir)).filter(n=>/^(LICENSE|LICENCE|COPYING|COPYRIGHT|UNLICENSE)/i.test(n));
 if(pkg.license_file&&!names.includes(pkg.license_file))names.push(pkg.license_file);
 const texts=[];for(const name of names){try{const text=await readFile(path.resolve(dir,name),'utf8');texts.push(`${name}\n${text}`);}catch{}}
 sections.push(`\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license||'See source'}\n${pkg.repository||`https://crates.io/crates/${pkg.name}/${pkg.version}`}\n${texts.join('\n\n')||'The published crate has no standalone license text. Consult the linked source and its SPDX license declaration.'}\n`);
}
for(const packageName of ['@tauri-apps/api']){
 const dir=path.join('node_modules',packageName),pkg=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));
 for(const file of (await readdir(dir)).filter(n=>/^LICENSE/i.test(n))){sections.push(`\n${'='.repeat(72)}\n${packageName} ${pkg.version}\n${file}\n${await readFile(path.join(dir,file),'utf8')}\n`);}
}
sections.push(`\n${'='.repeat(72)}\nGeist font\n${await readFile('public/assets/licenses/Geist-OFL.txt','utf8')}\n`);
await writeFile('THIRD_PARTY_LICENSES.txt',sections.join('\n'));
console.log(`Collected license notices for ${metadata.packages.filter(p=>p.source).length} Rust packages, the frontend bridge, and Geist.`);
