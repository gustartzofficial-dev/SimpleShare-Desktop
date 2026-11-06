import {invoke} from '@tauri-apps/api/core';
let selected='';const $=id=>document.getElementById(id);
const value=await invoke('picker_command',{name:'ready'});
for(const source of value?.sources||[]){const button=document.createElement('button');button.className='audio-option';const name=document.createElement('strong'),exe=document.createElement('small');name.textContent=source.name;exe.textContent=source.executable;button.append(name,exe);button.onclick=()=>{selected=source.id;document.querySelectorAll('.audio-option').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');$('audioConfirm').disabled=false;};$('audioOptions').append(button);}
if(!value?.sources?.length)$('audioError').textContent='No eligible application windows were found. Your picture can continue without audio.';
async function command(name){try{await invoke('picker_command',{name,sourceId:selected||null});}catch(error){$('audioError').textContent=String(error);}}
$('audioConfirm').onclick=()=>command('select');$('audioCancel').onclick=()=>command('cancel');document.addEventListener('keydown',event=>{if(event.key==='Escape')command('cancel');});
