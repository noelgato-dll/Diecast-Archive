'use strict';
const KEY='diecast-archive-v1';
const VIEW_KEY='diecast-archive-view-mode';
const TAG_KEY='diecast-archive-tag-registry-v1';
let viewMode='detailed';
try { viewMode=localStorage.getItem(VIEW_KEY)==='compact'?'compact':'detailed'; } catch (_) {}
function applyViewMode(){document.body.dataset.view=viewMode;document.querySelectorAll('input[name="viewMode"]').forEach(el=>{el.checked=el.value===viewMode});}

const NAMES=['brand','make','model','color','packaging','description'];
// Tags are optional and never change the original six-field record signature.
// Tags are stored as {label,emoji}; legacy string tags are supported.
const DEFAULT_EMOJI='🏷️';
function cleanTags(value){
  if(!Array.isArray(value))return [];
  const found=new Set(),out=[];
  for(const entry of value){
    const raw=typeof entry==='string'?{label:entry,emoji:DEFAULT_EMOJI}:entry;
    if(!raw||typeof raw.label!=='string')continue;
    const label=raw.label.trim().replace(/\s+/g,' ').slice(0,80);
    const key=label.toLocaleLowerCase();
    if(!label||found.has(key))continue;
    const emoji=typeof raw.emoji==='string'&&raw.emoji.trim()?raw.emoji.trim().slice(0,24):DEFAULT_EMOJI;
    found.add(key);out.push({label,emoji});
    if(out.length>=30)break;
  }
  return out;
}
function tagsFor(record){return cleanTags(record?.tags)}
let tagRegistry=[];
function tagKey(label){return label.trim().replace(/\s+/g,' ').toLocaleLowerCase()}
function knownTags(){return cleanTags([...tagRegistry,...records.flatMap(r=>tagsFor(r))])}
function loadRegistry(){try{const value=JSON.parse(localStorage.getItem(TAG_KEY)||'[]');tagRegistry=cleanTags(value)}catch(_){tagRegistry=[]}}
function saveRegistry(next){try{localStorage.setItem(TAG_KEY,JSON.stringify(next));tagRegistry=next;return true}catch(_){status('Could not save tags. Storage may be full.',true);return false}}
function syncRegistryFromRecords(){const known=new Map(tagRegistry.map(t=>[tagKey(t.label),t]));for(const tag of records.flatMap(r=>tagsFor(r)))if(!known.has(tagKey(tag.label)))known.set(tagKey(tag.label),tag);const next=[...known.values()];if(next.length!==tagRegistry.length)saveRegistry(next)}
function canonicalTags(tags){const known=new Map(knownTags().map(t=>[tagKey(t.label),t]));return cleanTags(tags).map(t=>known.get(tagKey(t.label))||t)}

const $=id=>document.getElementById(id);
let records=[];let editingId=null;let pending=[];
// Editing is session-only: it starts disabled on every fresh page load.
let archiveEditing=false;
function setArchiveEditing(enabled){archiveEditing=!!enabled;document.body.classList.toggle('archive-editing',archiveEditing);$('doneEditingBtn').hidden=!archiveEditing;$('toggleEditingBtn').textContent=archiveEditing?'Disable':'Enable';$('toggleEditingBtn').setAttribute('aria-pressed',String(archiveEditing));render();}
function uid(){return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
function validRecord(obj){return obj && typeof obj==='object' && NAMES.every(k=>typeof obj[k]==='string')}
function normalize(obj){return {id:uid(),...Object.fromEntries(NAMES.map(k=>[k,obj[k]])),tags:tagsFor(obj)}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(records));return true}catch(err){status('Unable to save. Storage may be full or disabled.',true);return false}}
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':''}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
let selectedSearchTags=[];
function renderSearchFilters(){
 const area=$('searchFilters');area.replaceChildren();
 for(const key of selectedSearchTags){const tag=knownTags().find(t=>tagKey(t.label)===key);if(!tag)continue;
  const chip=node('button','searchFilterChip',`${tag.emoji} ${tag.label} ×`);chip.type='button';chip.title=`Remove ${tag.label} filter`;
  chip.addEventListener('click',()=>{selectedSearchTags=selectedSearchTags.filter(k=>k!==key);render()});area.append(chip)}
 if(selectedSearchTags.length||$('search').value){const clear=node('button','clearSearchBtn','Clear filters');clear.type='button';clear.addEventListener('click',()=>{selectedSearchTags=[];$('search').value='';render()});area.append(clear)}
 const suggestions=$('tagSearchSuggestions');suggestions.replaceChildren();
 const q=$('search').value.trim().toLocaleLowerCase();if(!q){suggestions.hidden=true;return}
 const matching=knownTags().filter(t=>t.label.toLocaleLowerCase().includes(q)&&!selectedSearchTags.includes(tagKey(t.label))).slice(0,6);
 suggestions.hidden=!matching.length;
 for(const tag of matching){const btn=node('button','tagSearchSuggestion',`${tag.emoji} ${tag.label}  ·  Search as tag +`);btn.type='button';btn.addEventListener('click',()=>{selectedSearchTags.push(tagKey(tag.label));$('search').value='';render();$('search').focus()});suggestions.append(btn)}
}
function render(){selectedSearchTags=selectedSearchTags.filter(k=>knownTags().some(t=>tagKey(t.label)===k));renderSearchFilters();const query=$('search').value.trim().toLocaleLowerCase();const matches=records.filter(r=>{const tags=tagsFor(r);const textMatches=!query||NAMES.some(k=>r[k].toLocaleLowerCase().includes(query))||tags.some(tag=>tag.label.toLocaleLowerCase().includes(query));const tagMatches=!selectedSearchTags.length||selectedSearchTags.some(key=>tags.some(tag=>tagKey(tag.label)===key));return textMatches&&tagMatches});$('count').textContent=`${matches.length} SHOWN / ${records.length} TOTAL`;$('list').replaceChildren();if(!matches.length){$('list').append(node('div','empty',records.length?'No matching diecasts.':'No diecasts yet. Add one or import your Apple Notes.'));return}for(const r of matches){const card=node('article','item'),top=node('div','itemTop'),head=node('div');head.append(node('h3','model',r.model||'(Unnamed model)'),node('p','muted',`${r.brand} · ${r.make}`));const actions=node('div','itemActions');const edit=node('button','iconButton',''),del=node('button','iconButton','');edit.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';del.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';edit.setAttribute('aria-label',`Edit ${r.model}`);del.setAttribute('aria-label',`Delete ${r.model}`);edit.title='Edit';del.title='Delete';del.classList.add('dangerIcon');edit.type=del.type='button';edit.addEventListener('click',()=>openEditor(r.id));del.addEventListener('click',()=>{if(!confirm(`Delete ${r.model||'this diecast'}?`))return;const old=records;records=records.filter(x=>x.id!==r.id);if(!save())records=old;else{status('Diecast deleted.');render()}});if(archiveEditing)actions.append(edit,del);top.append(head);if(archiveEditing)top.append(actions);const details=node('div','details');for(const k of NAMES){const pair=node('div');pair.append(node('span','label',k),node('span','',r[k]||'—'));details.append(pair)}card.append(top,details);
const tags=canonicalTags(tagsFor(r));
if(tags.length){
  card.classList.add('hasTags');
  const tagBtn=node('button','tagButton');tagBtn.type='button';
  tagBtn.setAttribute('aria-label',`Show ${tags.length} tags for ${r.model}`);
  tagBtn.setAttribute('aria-expanded','false');tagBtn.title='Show tags';
  for(const tag of tags)tagBtn.append(node('span','tagEmoji',tag.emoji));
  const tagPanel=node('div','tagPanel');tagPanel.hidden=true;
  for(const tag of tags){
    const chip=node('button','tagChip',`${tag.emoji} ${tag.label}`);
    chip.type='button';chip.title=`Search for ${tag.label}`;
    chip.addEventListener('click',()=>{const key=tagKey(tag.label);if(!selectedSearchTags.includes(key))selectedSearchTags.push(key);$('search').value='';render()});
    tagPanel.append(chip);
  }
  tagBtn.addEventListener('click',()=>{
    tagPanel.hidden=!tagPanel.hidden;
    tagBtn.setAttribute('aria-expanded',String(!tagPanel.hidden));
    tagBtn.title=tagPanel.hidden?'Show tags':'Hide tags';
    card.classList.toggle('tagsExpanded',!tagPanel.hidden);
  });
  card.append(tagBtn,tagPanel);
  // Reserve only the width occupied by the emojis, not a full new row.
  const syncSpace=()=>{
    const width=Math.ceil(tagBtn.getBoundingClientRect().width)+10;
    card.style.setProperty('--tag-space',`${width}px`);
  };
  requestAnimationFrame(syncSpace);
}
$('list').append(card)}}
function openEditor(id=null){editingId=id;const current=records.find(r=>r.id===id);$('editorTitle').textContent=current?'Edit diecast':'Add diecast';$('fields').replaceChildren();for(const k of NAMES){const label=node('label','',k[0].toUpperCase()+k.slice(1));const field=k==='description'?document.createElement('textarea'):document.createElement('input');field.name=k;field.value=current?.[k]||'';if(k==='model')field.required=true;label.append(field);$('fields').append(label)}const section=node('fieldset','tagEditor');section.append(node('legend','','Assign tags'));
const picker=node('div','tagPicker');const assigned=new Set(tagsFor(current||{}).map(t=>tagKey(t.label)));
function drawPicker(){picker.replaceChildren();const tags=knownTags();if(!tags.length)picker.append(node('p','muted','No tags yet. Use + → Tag to create one.'));for(const tag of tags){const label=node('label','tagChoice');const cb=document.createElement('input');cb.type='checkbox';cb.value=tag.label;cb.checked=assigned.has(tagKey(tag.label));cb.addEventListener('change',()=>{if(cb.checked)assigned.add(tagKey(tag.label));else assigned.delete(tagKey(tag.label))});label.append(cb,node('span','',`${tag.emoji} ${tag.label}`));picker.append(label)}}
drawPicker();section.append(picker);$('fields').append(section);
$('editor').showModal()}
$('addBtn').addEventListener('click',()=>$('addMenuDialog').showModal());$('addDiecastChoice').addEventListener('click',()=>{$('addMenuDialog').close();openEditor()});$('addTagChoice').addEventListener('click',()=>{$('addMenuDialog').close();openTagEditor()});$('closeAddMenu').addEventListener('click',()=>$('addMenuDialog').close());$('cancelEdit').addEventListener('click',()=>$('editor').close());$('editorForm').addEventListener('submit',e=>{e.preventDefault();const values=Object.fromEntries(NAMES.map(k=>[k,e.target.elements.namedItem(k).value.trim()]));values.tags=knownTags().filter(t=>[...e.target.querySelectorAll('.tagChoice input:checked')].some(cb=>tagKey(cb.value)===tagKey(t.label)));
const old=records;records=editingId?records.map(r=>r.id===editingId?{...r,...values}:r):[...records,{id:uid(),...values}];if(!save()){records=old;return}$('editor').close();status('Diecast saved.');render()});$('search').addEventListener('input',render);
let editingTagKey=null;
function openTagEditor(key=null){editingTagKey=key;const current=tagRegistry.find(t=>tagKey(t.label)===key);$('tagEditorTitle').textContent=current?'Edit tag':'Create tag';$('tagName').value=current?.label||'';$('tagEmoji').value=current?.emoji||'';$('tagDialog').showModal()}
$('cancelTag').addEventListener('click',()=>$('tagDialog').close());
$('tagForm').addEventListener('submit',e=>{e.preventDefault();const label=$('tagName').value.trim().replace(/\s+/g,' '),emoji=$('tagEmoji').value.trim()||DEFAULT_EMOJI,key=tagKey(label);if(!label)return;const existing=tagRegistry.find(t=>tagKey(t.label)===key);if(existing&&key!==editingTagKey){status('A tag with that name already exists.',true);return}const before=tagRegistry.map(t=>({...t}));const oldRecords=records.map(r=>({...r,tags:tagsFor(r)}));let next=editingTagKey?tagRegistry.map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t):[...tagRegistry,{label,emoji}];next=cleanTags(next);if(!saveRegistry(next))return;if(editingTagKey){records=records.map(r=>({...r,tags:tagsFor(r).map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t)}));if(!save()){records=oldRecords;saveRegistry(before);return}}
$('tagDialog').close();status('Tag saved.');render();renderTagManager()});
function renderTagManager(){const list=$('tagManagerList');list.replaceChildren();const tags=tagRegistry;if(!tags.length)list.append(node('p','muted','No tags created yet.'));for(const tag of tags){const row=node('div','manageTagRow');const count=records.filter(r=>tagsFor(r).some(t=>tagKey(t.label)===tagKey(tag.label))).length;const info=node('div','manageTagInfo');info.append(node('strong','',`${tag.emoji} ${tag.label}`),node('small','',`${count} diecast${count===1?'':'s'}`));const edit=node('button','','Edit');edit.type='button';edit.addEventListener('click',()=>{ $('manageTagsDialog').close();openTagEditor(tagKey(tag.label))});const del=node('button','danger','Delete');del.type='button';del.addEventListener('click',()=>{if(!confirm(`Delete tag "${tag.label}" and remove it from ${count} diecast(s)? No diecasts will be deleted.`))return;const before=tagRegistry.map(t=>({...t})),oldRecords=records.map(r=>({...r,tags:tagsFor(r)}));const next=tagRegistry.filter(t=>tagKey(t.label)!==tagKey(tag.label));if(!saveRegistry(next))return;records=records.map(r=>({...r,tags:tagsFor(r).filter(t=>tagKey(t.label)!==tagKey(tag.label))}));if(!save()){records=oldRecords;saveRegistry(before);return}renderTagManager();render();status('Tag deleted; diecast records preserved.')});row.append(info,edit,del);list.append(row)}}
$('manageTagsBtn').addEventListener('click',()=>{$('settingsDialog').close();renderTagManager();$('manageTagsDialog').showModal()});
$('closeManageTags').addEventListener('click',()=>$('manageTagsDialog').close());
$('newTagFromManager').addEventListener('click',()=>{$('manageTagsDialog').close();openTagEditor()});

function parseNotes(raw){const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const errors=[];const parsed=[];if(lines.length%3)errors.push(`Found ${lines.length} nonempty rows; expected a multiple of 3.`);for(let i=0;i+2<lines.length;i+=3){const rows=lines.slice(i,i+3).map(s=>s.split('\t').map(v=>v.trim()));if(rows.some(r=>r.length!==2)){errors.push(`Rows ${i+1}–${i+3} must each contain two tab-separated values.`);continue}const values=rows.flat();parsed.push(Object.fromEntries(NAMES.map((k,j)=>[k,values[j]])))}return {parsed,errors}}
function signature(r){return NAMES.map(k=>r[k].trim().toLocaleLowerCase()).join('\u0000')}
$('importNotesBtn').addEventListener('click',()=>{$('notesDialog').showModal()});$('closeNotes').addEventListener('click',()=>$('notesDialog').close());$('notesInput').addEventListener('input',()=>{$('confirmImport').disabled=true;pending=[];$('preview').replaceChildren()});function importCounts(){const existing=new Set(records.map(signature)),seen=new Set();let dup=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))dup++;seen.add(sig)}const skip=document.querySelector('input[name="duplicateMode"]:checked').value==='skip';$('importSummary').textContent=`${skip?pending.length-dup:pending.length} will be imported · ${skip?dup:0} skipped`;return dup}
document.querySelectorAll('input[name="duplicateMode"]').forEach(el=>el.addEventListener('change',importCounts));
$('previewBtn').addEventListener('click',()=>{const result=parseNotes($('notesInput').value);pending=result.errors.length?[]:result.parsed;const container=$('preview');container.replaceChildren();$('duplicateOptions').hidden=!pending.length;for(const error of result.errors)container.append(node('p','error',error));if(!result.errors.length){const existing=new Set(records.map(signature)),seen=new Set();let duplicates=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))duplicates++;seen.add(sig);container.append(node('p','',`${r.brand} / ${r.make} / ${r.model} / ${r.color} / ${r.packaging} / ${r.description}`))}container.prepend(node('p','',`${pending.length} valid records · ${duplicates} possible exact duplicates`));importCounts()}$('confirmImport').disabled=!pending.length||!!result.errors.length});
$('confirmImport').addEventListener('click',()=>{if(!pending.length)return;const keep=document.querySelector('input[name="duplicateMode"]:checked').value==='keep',seen=new Set(records.map(signature));const toAdd=pending.filter(r=>{const sig=signature(r);if(!keep&&seen.has(sig))return false;seen.add(sig);return true});const old=records;records=[...records,...toAdd.map(normalize)];if(!save()){records=old;return}const count=toAdd.length,skipped=pending.length-count;pending=[];$('notesDialog').close();$('notesInput').value='';$('preview').replaceChildren();$('duplicateOptions').hidden=true;$('confirmImport').disabled=true;status(`Imported ${count} diecasts${skipped?`; skipped ${skipped} duplicates`:''}.`);render()});
$('exportBtn').addEventListener('click',()=>{const data=JSON.stringify({format:'diecast-archive',version:2,exportedAt:new Date().toISOString(),records,tags:tagRegistry},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`diecast-archive-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);status('Backup file prepared. Keep it somewhere safe.')});$('restoreBtn').addEventListener('click',()=>$('backupFile').click());$('backupFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.format!=='diecast-archive'||![1,2].includes(data.version)||!Array.isArray(data.records)||!data.records.every(validRecord))throw Error('Not a valid Diecast Archive backup.');if(data.version===2&&(!Array.isArray(data.tags)||!data.tags.every(t=>t&&typeof t.label==='string'&&typeof t.emoji==='string')))throw Error('Invalid tag registry in backup.');if(!confirm(`Replace all ${records.length} current diecasts with ${data.records.length} from this backup? Export a backup first if needed.`))return;const old=records,oldTags=tagRegistry.map(t=>({...t}));const nextRecords=data.records.map(normalize);const nextTags=cleanTags([...(data.version===2?data.tags:[]),...nextRecords.flatMap(r=>tagsFor(r))]);if(!saveRegistry(nextTags))return;records=nextRecords;if(!save()){records=old;saveRegistry(oldTags);return}status(`Restored ${records.length} diecasts and ${tagRegistry.length} tags.`);render()}catch(err){status(err.message,true)}finally{e.target.value=''}});
try{const raw=localStorage.getItem(KEY);if(raw){const data=JSON.parse(raw);if(!Array.isArray(data)||!data.every(validRecord))throw Error('Invalid saved catalogue');records=data.map(r=>({...r,id:r.id||uid(),tags:tagsFor(r)}))}}catch(err){status('Could not load saved catalogue. Existing stored data was not overwritten.',true)}loadRegistry();syncRegistryFromRecords();render();

// Offline shell caching applies only on HTTPS or localhost, not file://.
const offlineInfo = document.getElementById('offlineInfo');
function updateConnectionLabel(){offlineInfo.textContent = navigator.onLine ? 'NETWORK: ONLINE · CATALOGUE: ON THIS DEVICE' : 'NETWORK: OFFLINE · CATALOGUE: ON THIS DEVICE';}
window.addEventListener('online',updateConnectionLabel);window.addEventListener('offline',updateConnectionLabel);updateConnectionLabel();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{offlineInfo.textContent += ' · OFFLINE INSTALL UNAVAILABLE';}));
}

$('settingsBtn').addEventListener('click',()=>$('settingsDialog').showModal());
$('closeSettings').addEventListener('click',()=>$('settingsDialog').close());
$('deleteAllBtn').addEventListener('click',()=>{$('deleteAllMessage').textContent=`You are about to delete all ${records.length} diecast records.`;$('deleteAllText').value='';$('confirmDeleteAll').disabled=true;$('settingsDialog').close();$('deleteAllDialog').showModal()});
$('deleteAllText').addEventListener('input',()=>{$('confirmDeleteAll').disabled=$('deleteAllText').value!=='DELETE'});
$('cancelDeleteAll').addEventListener('click',()=>$('deleteAllDialog').close());
$('confirmDeleteAll').addEventListener('click',()=>{if($('deleteAllText').value!=='DELETE')return;const old=records;records=[];if(!save()){records=old;return}$('deleteAllDialog').close();status(`Deleted ${old.length} diecasts.`);render()});

// View preference is separate from catalogue data and backups.
document.querySelectorAll('input[name="viewMode"]').forEach(el=>el.addEventListener('change',()=>{if(!el.checked)return;viewMode=el.value==='compact'?'compact':'detailed';applyViewMode();try{localStorage.setItem(VIEW_KEY,viewMode)}catch(_){status('View preference could not be saved on this device.',true)}}));
applyViewMode();

// Settings-only entry into editing mode; the floating Done control exits it.
$('toggleEditingBtn').addEventListener('click',()=>{if(archiveEditing){setArchiveEditing(false);return;}if(confirm('Would you like to edit your archive?')){setArchiveEditing(true);$('settingsDialog').close();}});
$('doneEditingBtn').addEventListener('click',()=>setArchiveEditing(false));
