import {GitHubCatalog} from './store.mjs';
const $=q=>document.querySelector(q),key=new URLSearchParams(location.hash.slice(1)).get('key')||'';
const privateLink=key?new URL('#key='+encodeURIComponent(key),location.href).href:'';
if(key)history.replaceState(null,'',location.pathname+location.search);
window.addEventListener('hashchange',()=>{if(new URLSearchParams(location.hash.slice(1)).get('key'))location.reload();});
const store=key?new GitHubCatalog({key}):null;
let state=null,trash=false,page=0,editId=null,busy=false,publication=0;
const selected=new Set(),size=25;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const error=message=>{$('#error').hidden=!message;$('#error').textContent=message||'';};
const notice=message=>{$('#notice').textContent=message;$('#notice').hidden=false;};
const number=s=>String(state.songs.indexOf(s)+1).padStart(3,'0');
function render(){
 const all=state?.songs||[],q=$('#search').value.trim().normalize('NFKC').toLowerCase();
 const match=s=>{if(!q)return true;const n=number(s);return /^\d+$/.test(q)?Number(n)===Number(q):`${s.name} ${s.singer}`.normalize('NFKC').toLowerCase().includes(q);};
 const filtered=all.filter(s=>!!s.deletedAt===trash&&match(s));
 page=Math.max(0,Math.min(page,Math.ceil(filtered.length/size)-1));$('#rows').replaceChildren();
 for(const song of filtered.slice(page*size,(page+1)*size)){
  const row=el('div',undefined,'row'),check=el('input');check.type='checkbox';check.checked=selected.has(String(song.id));check.disabled=busy;check.setAttribute('aria-label','选择 '+song.name);
  check.onchange=()=>{check.checked?selected.add(String(song.id)):selected.delete(String(song.id));render();};
  const info=el('div',undefined,'song'),title=el('strong',song.name);
  if(song.createdAt&&Date.now()-song.createdAt<604800000)title.append(el('span','NEW','new'));
  info.append(title,el('small',song.singer));
  const meta=el('div',undefined,'meta');meta.append(el('span',song.language||'未分类'),el('span',song.style||'未分类'));
  const actions=el('div',undefined,'row-actions');
  if(!trash){const edit=el('button','编辑');edit.disabled=busy;edit.onclick=()=>openEditor(song);actions.append(edit);}
  const remove=el('button',trash?'恢复':'移除');remove.disabled=busy;remove.onclick=()=>changeSelection([String(song.id)]);actions.append(remove);
  row.append(check,el('span',number(song),'number'),info,meta,actions);$('#rows').append(row);
 }
 $('#count').textContent=all.filter(s=>!s.deletedAt).length;$('#trash-count').textContent=all.filter(s=>s.deletedAt).length;
 $('#results').textContent=filtered.length+' 首';$('#empty').hidden=!state||filtered.length>0;
 $('#page').textContent=(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/size));
 $('#prev').disabled=page===0||busy;$('#next').disabled=(page+1)*size>=filtered.length||busy;
 $('#bulk').textContent=trash?'恢复所选':'移入回收站';$('#bulk').disabled=!selected.size||busy||!state;
 $('#active-tab').classList.toggle('active',!trash);$('#trash-tab').classList.toggle('active',trash);
 const visible=filtered.slice(page*size,(page+1)*size);$('#select-page').checked=!!visible.length&&visible.every(s=>selected.has(String(s.id)));
 $('#select-page').indeterminate=visible.some(s=>selected.has(String(s.id)))&&!$('#select-page').checked;
 $('#select-page').disabled=busy||!state;
 $('#select-page').onchange=e=>{visible.forEach(s=>e.target.checked?selected.add(String(s.id)):selected.delete(String(s.id)));render();};
 for(const [id,field] of [['languages','language'],['styles','style']])$('#'+id).replaceChildren(...[...new Set(all.map(s=>s[field]).filter(Boolean))].map(v=>{const o=el('option');o.value=v;return o;}));
 for(const id of ['add','import','backup','save','import-save'])$('#'+id).disabled=busy||!state;
 $('#refresh').disabled=busy||!store;$('#copy-link').disabled=!key;
 document.querySelectorAll('[data-close]').forEach(b=>b.disabled=busy);
}
async function watchPublication(snapshot){
 const ticket=++publication,deadline=Date.now()+360000;
 while(ticket===publication&&Date.now()<deadline){
  try{if(await store.isPublished(snapshot)){if(ticket===publication)$('#sync').textContent='已发布 · 第 '+snapshot.revision+' 版 · '+new Date(snapshot.updatedAt).toLocaleTimeString('zh-CN',{hour12:false});return;}}catch{}
  if(ticket!==publication)return;
  $('#sync').textContent='已保存 · 第 '+snapshot.revision+' 版正在发布';
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(ticket===publication){$('#sync').textContent='已保存 · 尚未确认发布';notice('数据已经保存。发布仍在等待，或当前网络无法确认；稍后点“刷新”核对，无需重复保存。');}
}
async function refresh(){
 if(busy||!store)return false;busy=true;render();
 try{error('');const latest=await store.load();state=latest;selected.clear();$('#sync').textContent='已读取 · 第 '+state.revision+' 版';void watchPublication(state);return true;}
 catch(e){error(e.message);$('#sync').textContent='读取失败 · 当前列表未更新';return false;}
 finally{busy=false;render();}
}
async function save(op){
 if(busy||!store||!state)return false;busy=true;render();
 try{const result=await store.save(op,state);state=result;selected.clear();error('');notice('已保存。其他管理设备点“刷新”即可读取；发布状态会自动更新。');$('#sync').textContent='已保存 · 第 '+state.revision+' 版正在发布';void watchPublication(state);return true;}
 finally{busy=false;render();}
}
function openEditor(song){
 if(busy||!state)return;editId=song?String(song.id):null;const f=$('#edit-form');f.reset();
 for(const name of ['name','singer','language','style'])f.elements[name].value=song?.[name]||'';
 $('#edit-title').textContent=song?'编辑歌曲':'添加歌曲';$('#edit-error').textContent='';$('#editor').showModal();f.elements.name.focus();
}
async function changeSelection(ids){
 if(busy)return;if(!trash&&!confirm('将 '+ids.length+' 首歌曲移入回收站？之后可以恢复。'))return;
 try{await save({type:trash?'restore':'remove',ids});}catch(e){error(e.message);}
}
function formError(id,e){
 const box=$('#'+id);box.textContent=e.message;
 if(e.message.includes('刷新')){const retry=el('button','刷新歌单，保留输入');retry.type='button';retry.style.marginTop='12px';retry.onclick=async()=>{if(await refresh())box.textContent='已刷新，可以核对后再次保存。';};box.append(el('br'),retry);}
}
$('#edit-form').onsubmit=async event=>{event.preventDefault();$('#edit-error').textContent='';try{const song=Object.fromEntries(new FormData(event.target));if(await save({type:editId?'edit':'add',id:editId,song}))$('#editor').close();}catch(e){formError('edit-error',e);}};
$('#import-form').onsubmit=async event=>{
 event.preventDefault();$('#import-error').textContent='';
 try{
  const raw=$('#batch').value.trim();let songs;
  if(raw.startsWith('[')){songs=JSON.parse(raw);if(!Array.isArray(songs))throw Error('请提供歌曲数组。');songs=songs.filter(s=>!s.deletedAt);}
  else songs=raw.split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{const p=line.split('\t').map(x=>x.trim());if(p.length<2||p.length>4||!p[0]||!p[1])throw Error('第 '+(i+1)+' 行格式不正确，请从表格复制至少两列。');return {name:p[0],singer:p[1],language:p[2]||'',style:p[3]||''};});
  const before=state.songs.length;
  if(await save({type:'import',songs})){$('#importer').close();notice('已导入 '+(state.songs.length-before)+' 首，跳过 '+(songs.length-(state.songs.length-before))+' 首重复歌曲。');}
 }catch(e){formError('import-error',e);}
};
$('#search').oninput=()=>{page=0;selected.clear();render();};$('#prev').onclick=()=>{page--;render();};$('#next').onclick=()=>{page++;render();};$('#refresh').onclick=refresh;
$('#active-tab').onclick=()=>{trash=false;page=0;selected.clear();render();};$('#trash-tab').onclick=()=>{trash=true;page=0;selected.clear();render();};$('#add').onclick=()=>openEditor(null);$('#bulk').onclick=()=>changeSelection([...selected]);
$('#import').onclick=()=>{$('#import-error').textContent='';$('#importer').showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)$('#'+b.dataset.close).close();});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('cancel',e=>{if(busy)e.preventDefault();}));
$('#backup').onclick=()=>{if(!state)return;const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state.songs,null,2)],{type:'application/json'}));a.download='希尔薇歌单备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notice('已导出完整歌单，包含回收站。');};
$('#copy-link').onclick=async()=>{if(!privateLink)return;try{await navigator.clipboard.writeText(privateLink);notice('已复制专用管理链接。请保存好，换设备时直接打开它。');}catch{const input=$('#link-value');input.value=privateLink;$('#link-copy').hidden=false;input.focus();input.select();}};
$('#link-hide').onclick=()=>{$('#link-value').value='';$('#link-copy').hidden=true;};
window.addEventListener('pagehide',()=>{publication++;});
render();
if(!key){error('请从你保存的专用管理链接进入。普通地址没有修改权限，无需登录 GitHub。');$('#sync').textContent='等待专用管理链接';}else void refresh();
