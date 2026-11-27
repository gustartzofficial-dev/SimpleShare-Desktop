import {invoke} from '@tauri-apps/api/core';
import './installer.css';
const command=name=>invoke('installer_command',{name});
const button=document.getElementById('install'),status=document.getElementById('installStatus'),progress=document.getElementById('progress'),cancel=document.getElementById('cancel');
let installed=false;
command('ready').then(info=>{document.getElementById('version').textContent=`SIMPLESHARE ${info.version}`;}).catch(error=>{status.textContent=String(error);button.disabled=true;});
cancel.addEventListener('click',()=>command('close'));
button.addEventListener('click',async()=>{
    button.disabled=true;cancel.disabled=true;
    try{
        if(installed){await command('launch');return;}
        progress.hidden=false;status.textContent='Adding SimpleShare to your applications…';
        await command('install');installed=true;status.textContent='You’re all set. SimpleShare is in your applications.';button.textContent='Open SimpleShare ↗';cancel.textContent='Close';
    }catch(error){status.textContent=String(error);}
    finally{progress.hidden=true;button.disabled=false;cancel.disabled=false;}
});
