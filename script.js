/* Copyright © 2026 noelgato-dll. All rights reserved. Proprietary source code; see COPYRIGHT. */
'use strict';
const KEY='diecast-archive-v1';
const VIEW_KEY='diecast-archive-view-mode';
const TAG_KEY='diecast-archive-tag-registry-v1';
const SORT_KEY='diecast-archive-sort-v1';
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
const selectedIds=new Set();let bulkTagMode='add';let busy=false;
function setArchiveEditing(enabled){if(!enabled)selectedIds.clear();archiveEditing=!!enabled;document.body.classList.toggle('archive-editing',archiveEditing);$('doneEditingBtn').hidden=!archiveEditing;$('toggleEditingBtn').textContent=archiveEditing?'Disable':'Enable';$('toggleEditingBtn').setAttribute('aria-pressed',String(archiveEditing));render();}
function uid(){return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
function validRecord(obj){return obj && typeof obj==='object' && NAMES.every(k=>typeof obj[k]==='string')}
function normalize(obj){return {id:uid(),...Object.fromEntries(NAMES.map(k=>[k,obj[k]])),tags:tagsFor(obj),...(typeof obj.createdAt==='string'&&Number.isFinite(Date.parse(obj.createdAt))?{createdAt:obj.createdAt}:{})}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(records));return true}catch(err){status('Unable to save. Storage may be full or disabled.',true);return false}}
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':''}
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
let selectedSearchTags=[];
let selectedSearchKeywords=[];
function addSearchKeyword(value){
 const keyword=value.trim().replace(/\s+/g,' ');
 if(!keyword)return;
 if(!selectedSearchKeywords.some(k=>k.toLocaleLowerCase()===keyword.toLocaleLowerCase()))selectedSearchKeywords.push(keyword);
 $('search').value='';render();
}
function addSearchTag(key){
 if(!selectedSearchTags.includes(key))selectedSearchTags.push(key);
 $('search').value='';render();
}
function renderSearchFilters(){
 const area=$('searchFilters');area.replaceChildren();
 for(const keyword of selectedSearchKeywords){
  const chip=node('button','searchFilterChip',`⌕ ${keyword} ×`);chip.type='button';chip.title=`Remove keyword ${keyword}`;
  chip.addEventListener('click',()=>{selectedSearchKeywords=selectedSearchKeywords.filter(k=>k!==keyword);render()});area.append(chip);
 }
 for(const key of selectedSearchTags){const tag=knownTags().find(t=>tagKey(t.label)===key);if(!tag)continue;
  const chip=node('button','searchFilterChip',`${tag.emoji} ${tag.label} ×`);chip.type='button';chip.title=`Remove tag ${tag.label}`;
  chip.addEventListener('click',()=>{selectedSearchTags=selectedSearchTags.filter(k=>k!==key);render()});area.append(chip)}
 if(selectedSearchTags.length||selectedSearchKeywords.length||$('search').value){const clear=node('button','clearSearchBtn','Clear filters');clear.type='button';clear.addEventListener('click',()=>{selectedSearchTags=[];selectedSearchKeywords=[];$('search').value='';render()});area.append(clear)}
 const suggestions=$('tagSearchSuggestions');suggestions.replaceChildren();
 const q=$('search').value.trim().toLocaleLowerCase();if(!q){suggestions.hidden=true;return}
 const matching=knownTags().filter(t=>t.label.toLocaleLowerCase().includes(q)&&!selectedSearchTags.includes(tagKey(t.label))).slice(0,6);
 suggestions.hidden=!matching.length;
 for(const tag of matching){const btn=node('button','tagSearchSuggestion',`${tag.emoji} ${tag.label}  ·  Search as tag +`);btn.type='button';btn.addEventListener('click',()=>{addSearchTag(tagKey(tag.label));$('search').focus()});suggestions.append(btn)}
}
function recordMatchesSearch(record,query){
 const tags=tagsFor(record);
 const fields=[...NAMES.map(k=>record[k].toLocaleLowerCase()),...tags.map(t=>t.label.toLocaleLowerCase())];
 const words=[...selectedSearchKeywords.map(k=>k.toLocaleLowerCase()),...(query?[query]:[])];
 return words.every(word=>fields.some(field=>field.includes(word)))&&selectedSearchTags.every(key=>tags.some(tag=>tagKey(tag.label)===key));
}
function sortMatches(items){
 const mode=$('catalogueSort').value;
 if(mode==='default')return items;
 const [field,direction]=mode.split('-');
 const indexed=items.map((record,index)=>({record,index}));
 indexed.sort((a,b)=>{
  let result=0;
  if(field==='date'){
   // Legacy entries have no creation timestamp; retain their original catalogue order.
   const at=Date.parse(a.record.createdAt||'')||0,bt=Date.parse(b.record.createdAt||'')||0;
   result=at-bt;
  }else{
   result=String(a.record[field]||'').localeCompare(String(b.record[field]||''),undefined,{sensitivity:'base',numeric:true});
  }
  return (direction==='desc'?-result:result)||a.index-b.index;
 });
 return indexed.map(x=>x.record);
}
function render(){for(const id of selectedIds)if(!records.some(r=>r.id===id))selectedIds.delete(id);selectedSearchTags=selectedSearchTags.filter(k=>knownTags().some(t=>tagKey(t.label)===k));renderSearchFilters();const query=$('search').value.trim().toLocaleLowerCase();const matches=sortMatches(records.filter(r=>recordMatchesSearch(r,query)));$('count').textContent=`${matches.length} SHOWN / ${records.length} TOTAL`;updateBulkBar(matches);$('list').replaceChildren();if(!matches.length){$('list').append(node('div','empty',records.length?'NO MATCHES':'NO DIECASTS YET'));return}for(const r of matches){const card=node('article','item'),top=node('div','itemTop'),head=node('div');head.append(node('h3','model',r.model||'(Unnamed model)'),node('p','muted',`${r.brand} · ${r.make}`));const actions=node('div','itemActions');if(archiveEditing){const select=node('input','bulkCheckbox');select.type='checkbox';select.checked=selectedIds.has(r.id);select.setAttribute('aria-label',`Select ${r.model||'diecast'}`);select.addEventListener('change',()=>{if(select.checked)selectedIds.add(r.id);else selectedIds.delete(r.id);updateBulkBar();card.classList.toggle('bulkSelected',select.checked)});head.prepend(select);card.classList.toggle('bulkSelected',select.checked)}const edit=node('button','iconButton',''),del=node('button','iconButton','');edit.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';del.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';edit.setAttribute('aria-label',`Edit ${r.model}`);del.setAttribute('aria-label',`Delete ${r.model}`);edit.title='Edit';del.title='Delete';del.classList.add('dangerIcon');edit.type=del.type='button';edit.addEventListener('click',()=>openEditor(r.id));del.addEventListener('click',()=>{if(!confirm(`Delete ${r.model||'this diecast'}?`))return;const old=records;records=records.filter(x=>x.id!==r.id);if(!save())records=old;else{selectedIds.delete(r.id);status('Diecast deleted.');render()}});if(archiveEditing)actions.append(edit,del);top.append(head);if(archiveEditing)top.append(actions);const details=node('div','details');for(const k of NAMES){const pair=node('div');pair.append(node('span','label',k),node('span','',r[k]||'—'));details.append(pair)}card.append(top,details);
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
    chip.addEventListener('click',()=>{addSearchTag(tagKey(tag.label))});
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
const picker=document.createElement('details');picker.className='tagPickerDropdown';
const summary=document.createElement('summary');summary.className='tagPickerSummary';
const summaryText=node('span','tagPickerSelected');summary.append(summaryText,node('span','tagPickerChevron','▾'));picker.append(summary);
const options=node('div','tagPickerOptions');picker.append(options);
const assigned=new Set(tagsFor(current||{}).map(t=>tagKey(t.label)));
function updateTagSummary(){const chosen=knownTags().filter(t=>assigned.has(tagKey(t.label)));summaryText.replaceChildren();if(chosen.length){const icons=node('span','tagPickerIcons',chosen.map(t=>t.emoji).join(' '));summaryText.append(icons,node('span','tagPickerCount',`${chosen.length} selected`))}else summaryText.append(node('span','tagPickerHint','Select tags'))}
function drawPicker(){options.replaceChildren();const tags=knownTags();if(!tags.length)options.append(node('p','muted','No tags yet. Use + → Tag to create one.'));for(const tag of tags){const choice=document.createElement('button');choice.type='button';choice.className='tagPickerOption';choice.dataset.tagKey=tagKey(tag.label);choice.setAttribute('aria-pressed',String(assigned.has(tagKey(tag.label))));const text=node('span','tagPickerOptionName',`${tag.emoji} ${tag.label}`);const check=node('span','tagPickerCheck',assigned.has(tagKey(tag.label))?'✓':'');choice.append(text,check);choice.addEventListener('click',()=>{const key=tagKey(tag.label);if(assigned.has(key))assigned.delete(key);else assigned.add(key);choice.setAttribute('aria-pressed',String(assigned.has(key)));check.textContent=assigned.has(key)?'✓':'';updateTagSummary()});options.append(choice)}updateTagSummary()}
drawPicker();section.append(picker);$('fields').append(section);
$('editor').showModal()}
$('addBtn').addEventListener('click',()=>$('addMenuDialog').showModal());$('addDiecastChoice').addEventListener('click',()=>{$('addMenuDialog').close();openEditor()});$('addTagChoice').addEventListener('click',()=>{$('addMenuDialog').close();openTagEditor()});$('closeAddMenu').addEventListener('click',()=>$('addMenuDialog').close());$('cancelEdit').addEventListener('click',()=>$('editor').close());$('editorForm').addEventListener('submit',e=>{e.preventDefault();const values=Object.fromEntries(NAMES.map(k=>[k,e.target.elements.namedItem(k).value.trim()]));values.tags=knownTags().filter(t=>[...e.target.querySelectorAll('.tagPickerOption[aria-pressed="true"]')].some(btn=>btn.dataset.tagKey===tagKey(t.label)));
const old=records;records=editingId?records.map(r=>r.id===editingId?{...r,...values}:r):[...records,{id:uid(),createdAt:new Date().toISOString(),...values}];if(!save()){records=old;return}$('editor').close();status('Diecast saved.');render()});$('search').addEventListener('input',render);
$('search').addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing)return;
 e.preventDefault();addSearchKeyword($('search').value);
});
let editingTagKey=null;let returnToBulkTag=false;
function openTagEditor(key=null){editingTagKey=key;const current=tagRegistry.find(t=>tagKey(t.label)===key);$('tagEditorTitle').textContent=current?'Edit tag':'Create tag';$('tagName').value=current?.label||'';$('tagEmoji').value=current?.emoji||'';$('tagDialog').showModal()}
$('cancelTag').addEventListener('click',()=>{$('tagDialog').close();returnToBulkTag=false});
$('tagForm').addEventListener('submit',e=>{e.preventDefault();const label=$('tagName').value.trim().replace(/\s+/g,' '),emoji=$('tagEmoji').value.trim()||DEFAULT_EMOJI,key=tagKey(label);if(!label)return;const existing=tagRegistry.find(t=>tagKey(t.label)===key);if(existing&&key!==editingTagKey){status('A tag with that name already exists.',true);return}const before=tagRegistry.map(t=>({...t}));const oldRecords=records.map(r=>({...r,tags:tagsFor(r)}));let next=editingTagKey?tagRegistry.map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t):[...tagRegistry,{label,emoji}];next=cleanTags(next);if(!saveRegistry(next))return;if(editingTagKey){records=records.map(r=>({...r,tags:tagsFor(r).map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t)}));if(!save()){records=oldRecords;saveRegistry(before);return}}
$('tagDialog').close();status('Tag saved.');render();renderTagManager();if(returnToBulkTag){returnToBulkTag=false;openBulkTag('add');$('bulkTagChoice').value=tagKey(label)}});
// Usage counts are derived from catalogue records, never stored independently.
function tagUsageCounts(){
 const counts=new Map(tagRegistry.map(t=>[tagKey(t.label),0]));
 for(const record of records){
  const assigned=new Set(tagsFor(record).map(t=>tagKey(t.label)));
  for(const key of assigned)counts.set(key,(counts.get(key)||0)+1);
 }
 return counts;
}
function sortedManagedTags(counts){
 const mode=$('tagSort').value;
 return [...tagRegistry].sort((a,b)=>{
  const diff=(counts.get(tagKey(a.label))||0)-(counts.get(tagKey(b.label))||0);
  if(mode==='most'&&diff)return -diff;
  if(mode==='least'&&diff)return diff;
  return a.label.localeCompare(b.label,undefined,{sensitivity:'base'});
 });
}
function renderTagManager(){
 const list=$('tagManagerList');list.replaceChildren();
 const counts=tagUsageCounts();
 const tags=sortedManagedTags(counts);
 const unused=tagRegistry.filter(t=>(counts.get(tagKey(t.label))||0)===0);
 $('tagUsageSummary').textContent=`${tagRegistry.length} tags · ${records.length} diecasts`;
 $('unusedTagSummary').textContent=`${unused.length} unused tag${unused.length===1?'':'s'}${unused.length?': '+unused.map(t=>`${t.emoji} ${t.label}`).join(', '):''}`;
 $('deleteUnusedTags').disabled=!unused.length;
 if(!tags.length)list.append(node('p','muted','No tags created yet.'));
 for(const tag of tags){
  const row=node('div','manageTagRow');const key=tagKey(tag.label);const count=counts.get(key)||0;
  const info=node('div','manageTagInfo');
  info.append(node('strong','',`${tag.emoji} ${tag.label}  (${count})`),node('small','',`${count} diecast${count===1?'':'s'}${count===0?' · Unused':''}`));
  const edit=node('button','','Edit');edit.type='button';edit.addEventListener('click',()=>{$('manageTagsDialog').close();openTagEditor(key)});
  const del=node('button','danger','Delete');del.type='button';del.addEventListener('click',()=>{
   if(!confirm(`Delete tag "${tag.label}" and remove it from ${count} diecast(s)? No diecasts will be deleted.`))return;
   const before=tagRegistry.map(t=>({...t})),oldRecords=records.map(r=>({...r,tags:tagsFor(r)}));
   const next=tagRegistry.filter(t=>tagKey(t.label)!==key);
   if(!saveRegistry(next))return;
   records=records.map(r=>({...r,tags:tagsFor(r).filter(t=>tagKey(t.label)!==key)}));
   if(!save()){records=oldRecords;saveRegistry(before);return}
   renderTagManager();render();status('Tag deleted; diecast records preserved.');
  });
  row.append(info,edit,del);list.append(row);
 }
}
$('tagSort').addEventListener('change',renderTagManager);
$('deleteUnusedTags').addEventListener('click',()=>{
 if(busy)return;
 const counts=tagUsageCounts();
 const unused=tagRegistry.filter(t=>(counts.get(tagKey(t.label))||0)===0);
 if(!unused.length){renderTagManager();return}
 const names=unused.map(t=>`${t.emoji} ${t.label}`).join('\n');
 if(!confirm(`Delete these ${unused.length} unused tag(s)?\n\n${names}\n\nNo diecast entries will be deleted.`))return;
 // Recalculate after confirmation and refuse if any tag became assigned.
 const fresh=tagUsageCounts();
 if(unused.some(t=>(fresh.get(tagKey(t.label))||0)!==0)){status('Tag usage changed; please review again.',true);renderTagManager();return}
 busy=true;
 const remove=new Set(unused.map(t=>tagKey(t.label)));
 const next=tagRegistry.filter(t=>!remove.has(tagKey(t.label)));
 const saved=saveRegistry(next);busy=false;
 if(!saved)return;
 selectedSearchTags=selectedSearchTags.filter(k=>!remove.has(k));
 renderTagManager();render();status(`Deleted ${unused.length} unused tag(s). No diecasts were changed.`);
});
$('manageTagsBtn').addEventListener('click',()=>{$('settingsDialog').close();renderTagManager();$('manageTagsDialog').showModal()});
$('closeManageTags').addEventListener('click',()=>$('manageTagsDialog').close());
$('newTagFromManager').addEventListener('click',()=>{$('manageTagsDialog').close();openTagEditor()});


// v0.3.3: selection is temporary; bulk updates write the catalogue once.
function visibleRecords(){const query=$('search').value.trim().toLocaleLowerCase();return records.filter(r=>recordMatchesSearch(r,query));}
function updateBulkBar(matches=visibleRecords()){$('bulkBar').hidden=!archiveEditing;$('selectionCount').textContent=`${selectedIds.size} selected`;for(const id of ['bulkAdd','bulkRemove','bulkDelete','clearSelection'])$(id).disabled=!selectedIds.size;$('selectVisible').disabled=!matches.length;}
$('selectVisible').addEventListener('click',()=>{for(const r of visibleRecords())selectedIds.add(r.id);render()});
$('clearSelection').addEventListener('click',()=>{selectedIds.clear();render()});
function selectedSet(){return new Set([...selectedIds].filter(id=>records.some(r=>r.id===id)))}
function updateCatalogue(next,message){if(busy)return false;busy=true;const old=records;records=next;const ok=save();if(!ok)records=old;busy=false;if(ok){status(message);render()}return ok}
function fillTagSelect(el,tags){el.replaceChildren();for(const t of tags){const opt=node('option','',`${t.emoji} ${t.label}`);opt.value=tagKey(t.label);el.append(opt)}}
function openBulkTag(mode){if(!archiveEditing||!selectedIds.size)return;bulkTagMode=mode;const tags=knownTags();if(!tags.length&&mode==='remove'){status('No tags available to remove.',true);return}fillTagSelect($('bulkTagChoice'),tags);$('bulkTagTitle').textContent=mode==='add'?'Add tag to selected':'Remove tag from selected';$('bulkTagMessage').textContent=`Apply to ${selectedIds.size} selected diecast(s). Existing unrelated tags are preserved.`;$('confirmBulkTag').disabled=!tags.length;$('bulkTagDialog').showModal()}
$('createBulkTag').addEventListener('click',()=>{$('bulkTagDialog').close();returnToBulkTag=true;openTagEditor()});
$('bulkAdd').addEventListener('click',()=>openBulkTag('add'));
$('bulkRemove').addEventListener('click',()=>openBulkTag('remove'));
$('cancelBulkTag').addEventListener('click',()=>$('bulkTagDialog').close());
$('confirmBulkTag').addEventListener('click',()=>{const key=$('bulkTagChoice').value,tag=knownTags().find(t=>tagKey(t.label)===key),ids=selectedSet();if(!tag||!ids.size||busy)return;const next=records.map(r=>{if(!ids.has(r.id))return r;const tags=tagsFor(r);return {...r,tags:bulkTagMode==='add'?cleanTags([...tags,tag]):tags.filter(t=>tagKey(t.label)!==key)}});if(updateCatalogue(next,`${bulkTagMode==='add'?'Added':'Removed'} tag for ${ids.size} selected diecast(s).`)){$('bulkTagDialog').close()}});
$('bulkDelete').addEventListener('click',()=>{if(!archiveEditing||!selectedIds.size)return;$('bulkDeleteMessage').textContent=`Permanently delete ${selectedIds.size} selected diecast(s)?`;$('bulkDeleteText').value='';$('confirmBulkDelete').disabled=true;$('bulkDeleteDialog').showModal()});
$('bulkDeleteText').addEventListener('input',()=>{$('confirmBulkDelete').disabled=$('bulkDeleteText').value!=='DELETE'});
$('cancelBulkDelete').addEventListener('click',()=>$('bulkDeleteDialog').close());
$('confirmBulkDelete').addEventListener('click',()=>{if($('bulkDeleteText').value!=='DELETE'||busy)return;const ids=selectedSet();if(!ids.size)return;const next=records.filter(r=>!ids.has(r.id));if(updateCatalogue(next,`Deleted ${ids.size} diecast(s).`)){selectedIds.clear();$('bulkDeleteDialog').close();render()}});
function tagUsage(key){return tagUsageCounts().get(key)||0}
function updateMergeSummary(){const src=$('mergeSource').value,dst=$('mergeDestination').value,tag=tagRegistry.find(t=>tagKey(t.label)===src);const valid=!!src&&!!dst&&src!==dst;$('confirmMerge').disabled=!valid;$('mergeSummary').textContent=!valid?'Choose two different tags.':`Merge “${tag.label}” into “${tagRegistry.find(t=>tagKey(t.label)===dst).label}”. ${tagUsage(src)} diecast(s) affected. Source tag will be removed.`}
$('mergeTagsBtn').addEventListener('click',()=>{if(tagRegistry.length<2){status('Create at least two tags before merging.',true);return}fillTagSelect($('mergeSource'),tagRegistry);fillTagSelect($('mergeDestination'),tagRegistry);$('mergeDestination').selectedIndex=1;updateMergeSummary();$('manageTagsDialog').close();$('mergeTagsDialog').showModal()});
$('mergeSource').addEventListener('change',updateMergeSummary);$('mergeDestination').addEventListener('change',updateMergeSummary);
$('cancelMerge').addEventListener('click',()=>{$('mergeTagsDialog').close();renderTagManager();$('manageTagsDialog').showModal()});
$('confirmMerge').addEventListener('click',()=>{if(busy)return;const src=$('mergeSource').value,dst=$('mergeDestination').value,source=tagRegistry.find(t=>tagKey(t.label)===src),target=tagRegistry.find(t=>tagKey(t.label)===dst);if(!source||!target||src===dst)return;const count=tagUsage(src);if(!confirm(`Merge “${source.label}” into “${target.label}” for ${count} diecast(s)? The source tag will be deleted.`))return;busy=true;const nextRecords=records.map(r=>{const tags=tagsFor(r);return tags.some(t=>tagKey(t.label)===src)?{...r,tags:cleanTags([...tags.filter(t=>tagKey(t.label)!==src),target])}:r});const nextRegistry=tagRegistry.filter(t=>tagKey(t.label)!==src);const oldRecords=records,oldRegistry=tagRegistry;
// Write the record changes first, then registry. Roll back records if registry fails.
records=nextRecords;if(!save()){records=oldRecords;busy=false;return}if(!saveRegistry(nextRegistry)){records=oldRecords;save();tagRegistry=oldRegistry;busy=false;return}busy=false;selectedSearchTags=selectedSearchTags.map(k=>k===src?dst:k).filter((k,i,a)=>a.indexOf(k)===i);$('mergeTagsDialog').close();status(`Merged ${source.label} into ${target.label} (${count} diecast(s)).`);render();renderTagManager()});

function parseNotes(raw){const lines=raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const errors=[];const parsed=[];if(lines.length%3)errors.push(`Found ${lines.length} nonempty rows; expected a multiple of 3.`);for(let i=0;i+2<lines.length;i+=3){const rows=lines.slice(i,i+3).map(s=>s.split('\t').map(v=>v.trim()));if(rows.some(r=>r.length!==2)){errors.push(`Rows ${i+1}–${i+3} must each contain two tab-separated values.`);continue}const values=rows.flat();parsed.push(Object.fromEntries(NAMES.map((k,j)=>[k,values[j]])))}return {parsed,errors}}
$('catalogueSort').addEventListener('change',()=>{try{localStorage.setItem(SORT_KEY,$('catalogueSort').value)}catch(_){}render()});

// Compact sorting menu: retain the original select as the single source of sort values.
const sortButton=$('sortMenuButton'),sortMenu=$('sortMenu'),sortSelect=$('catalogueSort');
function closeSortMenu(){sortMenu.hidden=true;sortButton.setAttribute('aria-expanded','false')}
function updateSortMenu(){
 sortMenu.replaceChildren();
 for(const option of sortSelect.options){
  const item=document.createElement('button');item.type='button';item.className='sortMenuItem';
  const selected=option.value===sortSelect.value;
  item.textContent=(selected?'✓  ':'   ')+option.textContent;
  item.setAttribute('aria-pressed',String(selected));
  item.addEventListener('click',()=>{sortSelect.value=option.value;sortSelect.dispatchEvent(new Event('change',{bubbles:true}));closeSortMenu();sortButton.focus()});
  sortMenu.append(item);
 }
}
sortButton.addEventListener('click',()=>{
 const opening=sortMenu.hidden;
 if(opening){updateSortMenu();sortMenu.hidden=false}else closeSortMenu();
 sortButton.setAttribute('aria-expanded',String(opening));
});
document.addEventListener('click',event=>{if(!event.target.closest('.sortControl'))closeSortMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!sortMenu.hidden){closeSortMenu();sortButton.focus()}});

try{const savedSort=localStorage.getItem(SORT_KEY);if([...$('catalogueSort').options].some(o=>o.value===savedSort))$('catalogueSort').value=savedSort}catch(_){}
function signature(r){return NAMES.map(k=>r[k].trim().toLocaleLowerCase()).join('\u0000')}
$('importNotesBtn').addEventListener('click',()=>{$('notesDialog').showModal()});$('closeNotes').addEventListener('click',()=>$('notesDialog').close());$('notesInput').addEventListener('input',()=>{$('confirmImport').disabled=true;pending=[];$('preview').replaceChildren()});function importCounts(){const existing=new Set(records.map(signature)),seen=new Set();let dup=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))dup++;seen.add(sig)}const skip=document.querySelector('input[name="duplicateMode"]:checked').value==='skip';$('importSummary').textContent=`${skip?pending.length-dup:pending.length} will be imported · ${skip?dup:0} skipped`;return dup}
document.querySelectorAll('input[name="duplicateMode"]').forEach(el=>el.addEventListener('change',importCounts));
$('previewBtn').addEventListener('click',()=>{const result=parseNotes($('notesInput').value);pending=result.errors.length?[]:result.parsed;const container=$('preview');container.replaceChildren();$('duplicateOptions').hidden=!pending.length;for(const error of result.errors)container.append(node('p','error',error));if(!result.errors.length){const existing=new Set(records.map(signature)),seen=new Set();let duplicates=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))duplicates++;seen.add(sig);container.append(node('p','',`${r.brand} / ${r.make} / ${r.model} / ${r.color} / ${r.packaging} / ${r.description}`))}container.prepend(node('p','',`${pending.length} valid records · ${duplicates} possible exact duplicates`));importCounts()}$('confirmImport').disabled=!pending.length||!!result.errors.length});
$('confirmImport').addEventListener('click',()=>{if(!pending.length)return;const keep=document.querySelector('input[name="duplicateMode"]:checked').value==='keep',seen=new Set(records.map(signature));const toAdd=pending.filter(r=>{const sig=signature(r);if(!keep&&seen.has(sig))return false;seen.add(sig);return true});const old=records;records=[...records,...toAdd.map(normalize)];if(!save()){records=old;return}const count=toAdd.length,skipped=pending.length-count;pending=[];$('notesDialog').close();$('notesInput').value='';$('preview').replaceChildren();$('duplicateOptions').hidden=true;$('confirmImport').disabled=true;status(`Imported ${count} diecasts${skipped?`; skipped ${skipped} duplicates`:''}.`);render()});
// Backups keep format v2 for compatibility, including tag definitions and assigned tags.
$('exportBtn').addEventListener('click',()=>{
 const data=JSON.stringify({format:'diecast-archive',version:2,exportedAt:new Date().toISOString(),records,tags:tagRegistry},null,2);
 const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`diecast-archive-${new Date().toISOString().slice(0,10)}.json`;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 status('Backup file prepared. Keep it somewhere safe.');
});
let pendingRestore=null;
function validateBackup(data){
 if(!data||data.format!=='diecast-archive'||![1,2].includes(data.version)||!Array.isArray(data.records)||!data.records.every(validRecord))throw Error('Not a valid Diecast Archive backup.');
 if(data.version===2&&(!Array.isArray(data.tags)||!data.tags.every(t=>t&&typeof t.label==='string'&&typeof t.emoji==='string')))throw Error('Invalid tag registry in backup.');
 if(data.records.some(r=>r.tags!==undefined&&!Array.isArray(r.tags)))throw Error('Invalid assigned tags in backup.');
 return data;
}
function restoreMode(){return document.querySelector('input[name="restoreMode"]:checked').value}
function updateRestoreChoice(){
 if(!pendingRestore)return;
 const add=restoreMode()==='add',count=pendingRestore.records.length;
 $('restoreOutcome').textContent=add?`Expected total: ${records.length+count} diecasts (all backup entries added).`:`Expected total: ${count} diecasts (current archive replaced).`;
 $('confirmRestore').textContent=add?'Add all':'Replace all';
 $('confirmRestore').classList.toggle('danger',!add);
}
$('restoreBtn').addEventListener('click',()=>$('backupFile').click());
$('backupFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  const data=validateBackup(JSON.parse(await file.text()));
  const importedTags=cleanTags([...(data.version===2?data.tags:[]),...data.records.flatMap(r=>tagsFor(r))]);
  // Reject unrepresentable backups rather than silently dropping tag definitions.
  const uniqueKeys=new Set([...(data.version===2?data.tags:[]),...data.records.flatMap(r=>tagsFor(r))].map(t=>typeof t==='string'?tagKey(t):t?.label&&tagKey(t.label)).filter(Boolean));
  if(uniqueKeys.size>30)throw Error('Backup has more than 30 distinct tags; this version supports at most 30. No changes made.');
  pendingRestore={records:data.records,tags:importedTags};
  document.querySelector('input[name="restoreMode"][value="add"]').checked=true;
  $('restoreSummary').textContent=`Current archive: ${records.length} diecasts and ${tagRegistry.length} tags. Backup: ${data.records.length} diecasts and ${importedTags.length} tags.`;
  updateRestoreChoice();$('settingsDialog').close();$('restoreChoiceDialog').showModal();
 }catch(err){pendingRestore=null;status(err.message,true)}finally{e.target.value=''}
});
document.querySelectorAll('input[name="restoreMode"]').forEach(el=>el.addEventListener('change',updateRestoreChoice));
$('cancelRestore').addEventListener('click',()=>{pendingRestore=null;$('restoreChoiceDialog').close()});
$('restoreChoiceDialog').addEventListener('close',()=>{pendingRestore=null});
$('confirmRestore').addEventListener('click',()=>{
 if(busy||!pendingRestore)return;
 const mode=restoreMode(),incoming=pendingRestore;
 if(mode==='replace'&&!confirm(`Replace all ${records.length} current diecasts with ${incoming.records.length} from this backup? This cannot be undone.`))return;
 busy=true;$('confirmRestore').disabled=true;
 try{
  const oldRecords=records,oldTags=tagRegistry;
  const nextTags=mode==='add'?cleanTags([...tagRegistry,...incoming.tags]):incoming.tags;
  const unionKeys=new Set([...(mode==='add'?tagRegistry:[]),...incoming.tags].map(t=>tagKey(t.label)));
  if(unionKeys.size>30)throw Error('Combined tag library exceeds the 30-tag limit. No changes made.');
  const canonical=new Map(nextTags.map(t=>[tagKey(t.label),t]));
  const imported=incoming.records.map(r=>{
   const normalized=normalize(r);normalized.tags=cleanTags(tagsFor(r).map(t=>canonical.get(tagKey(t.label))||t));
   return normalized;
  });
  const nextRecords=mode==='add'?[...records,...imported]:imported;
  // Commit catalogue first, then registry. If registry persistence fails, restore catalogue.
  records=nextRecords;
  if(!save()){records=oldRecords;return}
  if(!saveRegistry(nextTags)){
   records=oldRecords;
   if(!save())status('Restore failed and automatic rollback also failed. Do not reload; export the current archive immediately.',true);
   tagRegistry=oldTags;
   return;
  }
  selectedIds.clear();selectedSearchTags=[];selectedSearchKeywords=[];$('search').value='';
  $('restoreChoiceDialog').close();pendingRestore=null;
  status(`${mode==='add'?'Added':'Restored'} ${imported.length} diecasts. Archive now has ${records.length} diecasts and ${tagRegistry.length} tags.`);
  render();
 }catch(err){status(err.message,true)}finally{busy=false;$('confirmRestore').disabled=false}
});

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
$('confirmDeleteAll').addEventListener('click',()=>{if($('deleteAllText').value!=='DELETE')return;const old=records;records=[];if(!save()){records=old;return}$('deleteAllDialog').close();selectedIds.clear();status(`Deleted ${old.length} diecasts.`);render()});

// View preference is separate from catalogue data and backups.
document.querySelectorAll('input[name="viewMode"]').forEach(el=>el.addEventListener('change',()=>{if(!el.checked)return;viewMode=el.value==='compact'?'compact':'detailed';applyViewMode();try{localStorage.setItem(VIEW_KEY,viewMode)}catch(_){status('View preference could not be saved on this device.',true)}}));
applyViewMode();

// Settings-only entry into editing mode; the floating Done control exits it.
$('toggleEditingBtn').addEventListener('click',()=>{if(archiveEditing){setArchiveEditing(false);return;}if(confirm('Would you like to edit your archive?')){setArchiveEditing(true);$('settingsDialog').close();}});
$('doneEditingBtn').addEventListener('click',()=>setArchiveEditing(false));
