const ENDPOINT='https://api.github.com/repos/Nigel-0101/sylvie-songbook-admin/contents/catalog.json';
const clone=value=>structuredClone(value);
const uuid=()=>crypto.randomUUID();
const identity=song=>`${song.name.trim().toLocaleLowerCase()}\n${(song.singer||'').trim().toLocaleLowerCase()}`;
const encode=value=>{const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
const decode=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),x=>x.charCodeAt(0))));
function songFields(song){
 const result={};
 for(const [field,label,max] of [['name','歌名',180],['singer','歌手',180],['language','语言',40],['style','曲风',40]]){
  const value=song?.[field]??'';
  if(typeof value!=='string'||value.trim().length>max||(['name','singer'].includes(field)&&!value.trim()))throw Error(`${label}不能为空或超过 ${max} 个字。`);
  result[field]=value.trim();
 }
 return result;
}
function validate(data){
 if(!data||!Number.isInteger(data.revision)||data.revision<1||!Array.isArray(data.songs)||data.songs.length>5000)throw Error('歌单格式不正确，请恢复有效备份后重试。');
 const ids=new Set();
 for(const s of data.songs){if(!s||!['string','number'].includes(typeof s.id)||!String(s.id)||ids.has(String(s.id))||typeof s.name!=='string'||!s.name.trim()||(s.singer!=null&&typeof s.singer!=='string'))throw Error('歌单存在无效歌曲或重复编号，请核对后重试。');ids.add(String(s.id));}
 return data;
}
export function applyChange(original,op){
 if(!Array.isArray(original)||!op)throw Error('缺少有效歌单。');
 const songs=clone(original),now=Date.now();
 const duplicates=(candidate,except)=>songs.some(s=>!s.deletedAt&&String(s.id)!==String(except)&&identity(s)===identity(candidate));
 if(op.type==='add'||op.type==='edit'){
  const fields=songFields(op.song);
  if(duplicates(fields,op.type==='edit'?op.id:undefined))throw Error('已有同名、同歌手的歌曲。');
  if(op.type==='add')songs.push({...fields,id:uuid(),createdAt:now});
  else{const song=songs.find(s=>String(s.id)===String(op.id)&&!s.deletedAt);if(!song)throw Error('这首歌曲已被移除，请刷新歌单。');Object.assign(song,fields);}
 }else if(op.type==='remove'||op.type==='restore'){
  if(!Array.isArray(op.ids)||!op.ids.length||op.ids.length>5000)throw Error('请选择需要处理的歌曲。');
  const ids=new Set(op.ids.map(String));
  if([...ids].some(id=>!songs.some(s=>String(s.id)===id)))throw Error('歌曲已发生变化，请刷新歌单。');
  for(const song of songs.filter(s=>ids.has(String(s.id)))){
   if(op.type==='remove')song.deletedAt=now;
   else{if(duplicates(song,song.id))throw Error('已有同名、同歌手的歌曲，无法重复恢复。');delete song.deletedAt;}
  }
 }else if(op.type==='import'){
  if(!Array.isArray(op.songs)||!op.songs.length||op.songs.length>1000)throw Error('每次请导入 1–1000 首歌曲。');
  const candidates=op.songs.map(songFields);
  for(const fields of candidates)if(!duplicates(fields))songs.push({...fields,id:uuid(),createdAt:now});
 }else throw Error('不支持的歌单操作。');
 if(songs.length>5000)throw Error('歌单超过 5000 首上限，请先整理后再保存。');
 return songs;
}
class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
export class GitHubCatalog{
 constructor({key,fetcher=(...args)=>fetch(...args),publicationUrl}={}){
  if(!key)throw Error('请使用完整的专用管理链接打开此页。');
  this.key=key;this.fetcher=fetcher;this.publicationUrl=publicationUrl||new URL('catalog.json',globalThis.location?.href||'https://nigel-0101.github.io/sylvie-songbook-admin/').href;
 }
 async request(url,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{return await this.fetcher(url,{...options,signal:controller.signal,credentials:'omit',cache:'no-store'});}finally{clearTimeout(timeout);}
 }
 async api(method='GET',body){
  const url=ENDPOINT+(method==='GET'?`?ref=main&t=${Date.now()}`:'');
  const response=await this.request(url,{method,headers:{Authorization:`Bearer ${this.key}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){
   let message='连接 GitHub 失败，请稍后重试。';
   if(response.status===401)message='管理链接的授权已失效，请更换有效的专用链接。';
   else if(response.status===403)message=response.headers.get('x-ratelimit-remaining')==='0'?'请求过于频繁，请稍后再试。':'管理链接没有写入授权，或授权已过期，请核对专用链接。';
   else if(response.status===404)message='无法读取管理歌单，请核对专用链接的仓库授权。';
   else if(response.status===409)message='其他设备已更新歌单，请刷新后再保存；当前输入会保留。';
   else if(response.status===422)message='GitHub 未接受这次更新，请刷新后核对歌单。';
   throw new ApiError(message,response.status);
  }
  return response.json();
 }
 async load(){
  try{
   const file=await this.api();
   if(file.encoding!=='base64'||!file.content||!file.sha)throw Error('歌单文件过大或格式不正确，请检查云端备份。');
   return {...validate(decode(file.content)),sha:file.sha};
  }catch(e){if(e instanceof ApiError)throw e;throw Error('暂时无法读取歌单，请检查连接后重试。');}
 }
 async save(op,state){
  validate(state);if(!state.sha)throw Error('请先刷新歌单，再保存。');
  const data={revision:state.revision+1,updatedAt:new Date().toISOString(),lastOperation:uuid(),songs:applyChange(state.songs,op)};
  const content=encode(data);
  if(content.length>1300000)throw Error('歌单文件已超过管理页支持的大小，请先导出备份并整理。');
  const actions={add:'添加歌曲',edit:'编辑歌曲',remove:'移入回收站',restore:'恢复歌曲',import:'批量导入歌曲'};
  try{
   const result=await this.api('PUT',{branch:'main',message:`${actions[op.type]} · 歌单第 ${data.revision} 版`,sha:state.sha,content});
   if(!result.content?.sha)throw Error('保存响应不完整');
   return {...data,sha:result.content.sha};
  }catch(e){
   if(e instanceof ApiError&&e.status<500)throw e;
   try{const current=await this.load();if(current.lastOperation===data.lastOperation)return current;}catch{}
   throw Error('连接中断，尚未确认这次保存结果。请刷新歌单核对后再操作，当前输入会保留。');
  }
 }
 async isPublished(state){
  const url=new URL(this.publicationUrl);url.searchParams.set('check',String(Date.now()));
  const response=await this.request(url.href);
  if(!response.ok)return false;
  const data=validate(await response.json());
  return data.revision===state.revision&&(state.lastOperation?data.lastOperation===state.lastOperation:JSON.stringify(data.songs)===JSON.stringify(state.songs));
 }
}
