import {GitHubCatalog} from './store.mjs';
const $=q=>document.querySelector(q);let privateLink='';
$('#setup-form').onsubmit=async event=>{
 event.preventDefault();const key=$('#credential').value.trim();if(!key)return;
 $('#create').disabled=true;$('#status').classList.remove('error');$('#status').textContent='正在核验读取和保存权限…';$('#result').hidden=true;privateLink='';
 try{
  const store=new GitHubCatalog({key}),state=await store.load();
  await store.save({type:'check-access'},state);
  const target=new URL('./',location.href);target.hash='key='+encodeURIComponent(key);privateLink=target.href;
  $('#private-link').value=privateLink;$('#open').href=privateLink;$('#result').hidden=false;$('#credential').value='';
  $('#status').textContent='读取和保存验证通过。请保存下方完整链接，仅交给需要管理歌单的人。';
 }catch(e){$('#status').textContent=e.message;$('#status').classList.add('error');}
 finally{$('#create').disabled=false;}
};
$('#copy').onclick=async()=>{if(!privateLink)return;try{await navigator.clipboard.writeText(privateLink);$('#status').textContent='已复制，请保存到你自己的书签或笔记中。';}catch{$('#private-link').focus();$('#private-link').select();$('#status').textContent='请复制已经选中的完整链接。';}};
