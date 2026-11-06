import {invoke} from '@tauri-apps/api/core';
const $=id=>document.getElementById(id);
let selected='',kind='window',running=false;
const previews=new Map(),queue=[];
const data=await invoke('capture_picker_command',{name:'ready'});
async function drain(){
 if(running)return;running=true;
 while(queue.length){const task=queue.shift();if(!document.querySelector('.capture-source[data-id="'+CSS.escape(task.source.id)+'"]')){task.resolve(null);previews.delete(task.source.id);continue;}
  try{const url=await invoke('capture_thumbnail',{sourceId:task.source.id});task.resolve(url);}catch{task.resolve(null);}
 }
 running=false;
}
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);const {source,image,status}=entry.target.preview;
 let promise=previews.get(source.id);if(!promise){promise=new Promise(resolve=>queue.push({source,image,resolve}));previews.set(source.id,promise);}
 promise.then(url=>{if(!image.isConnected)return;if(url){image.src=url;image.hidden=false;status.remove();}else status.textContent='Preview unavailable';});drain();}},{root:$('captureSources'),rootMargin:'40px'});
function render(){
 observer.disconnect();const area=$('captureSources');area.replaceChildren();
 const visible=data.sources.filter(s=>s.kind===kind&&s.name.toLowerCase().includes($('sourceSearch').value.toLowerCase()));
 if(!visible.some(source=>source.id===selected)){selected='';$('captureConfirm').disabled=true;}
 for(const source of visible){
  const button=document.createElement('button');button.className='capture-source'+(source.id===selected?' selected':'');button.dataset.id=source.id;button.setAttribute('aria-pressed',String(source.id===selected));button.title=source.name;
  const preview=document.createElement('span'),image=document.createElement('img'),status=document.createElement('span');preview.className='source-preview';image.alt='Preview of '+source.name;image.hidden=true;status.textContent='Loading preview…';preview.append(image,status);preview.preview={source,image,status};
  const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=source.name;detail.textContent=source.detail;button.append(preview,title,detail);
  button.onclick=()=>{selected=source.id;document.querySelectorAll('.capture-source').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);item.setAttribute('aria-pressed',String(active));});$('captureConfirm').disabled=false;$('captureConfirm').textContent=kind==='display'?'Share display':'Share window';if(data.audio&&data.audioSources.some(s=>s.id===source.id))$('captureAudioSource').value=source.id;};area.append(button);observer.observe(preview);
 }
 if(!area.children.length){const empty=document.createElement('p');empty.textContent='No matching sources. Open the app you want to share, then reopen this selector.';area.append(empty);}
}
function tab(next){kind=next;$('windowsTab').setAttribute('aria-selected',String(kind==='window'));$('displaysTab').setAttribute('aria-selected',String(kind==='display'));$('sourceSearch').placeholder=kind==='display'?'Find a display…':'Find a window…';render();}
$('windowsTab').onclick=()=>tab('window');$('displaysTab').onclick=()=>tab('display');$('sourceSearch').oninput=render;
$('refreshPreviews').onclick=()=>{previews.clear();render();};
$('captureAudio').hidden=!data.audio;for(const source of data.audioSources){const option=document.createElement('option');option.value=source.id;option.textContent=source.name;$('captureAudioSource').append(option);}
async function command(name){$('captureError').textContent='';try{await invoke('capture_picker_command',{name,sourceId:selected||null,audioSourceId:$('captureAudioSource').value||null});}catch(error){$('captureError').textContent=String(error);}}
$('captureConfirm').onclick=()=>command('select');$('captureCancel').onclick=()=>command('cancel');document.addEventListener('keydown',e=>{if(e.key==='Escape')command('cancel');});render();
