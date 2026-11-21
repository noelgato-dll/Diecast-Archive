
const PHOTO_LIBRARY_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
const CAMERA_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h-4L8 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-2-3Z"/><circle cx="12" cy="13" r="3"/></svg>';
const TRASH_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';
let valueDisplayMode='acquired';
try { valueDisplayMode=localStorage.getItem('da-value-display-mode')==='market'?'market':'acquired'; } catch(_) {}
let pendingCroppedImage=null;
/* Copyright © 2026 noelgato-dll. All rights reserved. Proprietary source code; see COPYRIGHT. */
'use strict';
const KEY='diecast-archive-v1';
const VIEW_KEY='diecast-archive-view-mode';
const TAG_KEY='diecast-archive-tag-registry-v1';
const SORT_KEY='diecast-archive-sort-v1';
const PRICE_KEY='diecast-archive-price-settings-v1';
const CURRENCIES={PHP:'₱',USD:'$',EUR:'€',JPY:'¥',GBP:'£',CAD:'C$',AUD:'A$',SGD:'S$',KRW:'₩',CNY:'¥'};
let priceSettings={currency:'PHP',enabled:true,rates:{}};
try{const p=JSON.parse(localStorage.getItem(PRICE_KEY)||'null');if(p&&CURRENCIES[p.currency])priceSettings={currency:p.currency,enabled:p.enabled!==false,rates:p.rates||{}}}catch(_){}
function priceSave(){try{localStorage.setItem(PRICE_KEY,JSON.stringify(priceSettings));return true}catch(_){status('Could not save currency settings.',true);return false}}
function numericPrice(value){return value===null||value===undefined||value===''?null:Number.isFinite(Number(value))&&Number(value)>=0?Math.round(Number(value)*100)/100:null}
function money(value,currency){return `${CURRENCIES[currency]||currency} ${Number(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}
function exchange(value,source,target=priceSettings.currency){if(value===null||value===undefined)return null;if(source===target)return value;const rate=priceSettings.rates[`${source}_${target}`];return Number.isFinite(rate)&&rate>0?value*rate:null}
function copiesOf(record){return Array.isArray(record.copies)?record.copies:[]}
function qty(record){return 1+copiesOf(record).length}
function allCopies(record){return [record,...copiesOf(record)]}
function valueTotal(items,field){let sum=0,missing=0,unconverted=0;for(const r of items)for(const copy of allCopies(r)){const price=numericPrice(copy[field]);if(price===null){missing++;continue}const converted=exchange(price,copy[field+'Currency']||'PHP');if(converted===null){unconverted++;continue}sum+=converted}return {sum,missing,unconverted}}
function priceSummary(items){const ac=valueTotal(items,'priceAcquired'),mv=valueTotal(items,'marketValue');const shown=items.reduce((n,r)=>n+qty(r),0);return {shown,ac,mv}}

let viewMode='detailed';
try { viewMode=localStorage.getItem(VIEW_KEY)==='compact'?'compact':'detailed'; } catch (_) {}
function applyViewMode(){document.body.dataset.view=viewMode;document.querySelectorAll('input[name="viewMode"]').forEach(el=>{el.checked=el.value===viewMode});}

const NAMES=['brand','make','model','color','packaging','description'];
const scaleDigits=value=>String(value??'').replace(/^1:/,'').replace(/\D/g,'').slice(0,3);
const scaleValue=value=>scaleDigits(value)?'1:'+scaleDigits(value):'';
function previousSuggestions(field){const counts=new Map();for(const r of records)for(const c of [r,...copiesOf(r)]){const v=String(c[field]||'').trim();if(v){const k=v.toLocaleLowerCase();const old=counts.get(k);counts.set(k,{value:old?.value||v,count:(old?.count||0)+1})}}return [...counts.values()].sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value)).map(x=>x.value)}
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
const CONFIRM_KEY='diecast-archive-confirmations-v1';
let requireConfirmations=true;try{requireConfirmations=localStorage.getItem(CONFIRM_KEY)!=='false'}catch(_){}
function routineConfirm(message){return !requireConfirmations||window.confirm(message)}
function syncConfirmUI(){const cb=$('actionConfirmations');if(cb)cb.checked=requireConfirmations;const label=$('confirmStatus');if(label)label.textContent=requireConfirmations?'ENABLED':'DISABLED'}
const selectedIds=new Set();let bulkTagMode='add';let busy=false;
function setArchiveEditing(enabled){if(!enabled)selectedIds.clear();archiveEditing=!!enabled;document.body.classList.toggle('archive-editing',archiveEditing);$('doneEditingBtn').hidden=!archiveEditing;$('toggleEditingBtn').setAttribute('aria-label',archiveEditing?'Disable archive editing':'Enable archive editing');$('toggleEditingBtn').title=archiveEditing?'Disable archive editing':'Enable archive editing';$('toggleEditingBtn').setAttribute('aria-pressed',String(archiveEditing));render();}
function uid(){return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}
function validRecord(obj){return obj && typeof obj==='object' && NAMES.every(k=>typeof obj[k]==='string')}
function normalize(obj){return {id:uid(),...Object.fromEntries(NAMES.map(k=>[k,obj[k]])),copies:copiesOf(obj).map(c=>({...c,id:uid()})),image:obj.image||null,scale:scaleValue(obj.scale),priceAcquired:numericPrice(obj.priceAcquired),priceAcquiredCurrency:obj.priceAcquiredCurrency||'PHP',marketValue:numericPrice(obj.marketValue),marketValueCurrency:obj.marketValueCurrency||'PHP',tags:tagsFor(obj),...(typeof obj.createdAt==='string'&&Number.isFinite(Date.parse(obj.createdAt))?{createdAt:obj.createdAt}:{})}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(records));return true}catch(err){status('Unable to save. Storage may be full or disabled.',true);return false}}
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':''}
// Dismiss the previous notification when a user activates any app button.
// Capture phase ensures an action's own new notification is not accidentally erased.
document.addEventListener('click',event=>{
  const button=event.target.closest?.('button, input[type="button"], input[type="submit"], input[type="reset"]');
  if(!button || button.disabled)return;
  const banner=document.getElementById('status');
  if(banner && banner.textContent.trim()){
    banner.textContent='';
    banner.className='';
  }
},true);

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
 const fields=[...NAMES.map(k=>String(record[k]??'').toLocaleLowerCase()),...tags.map(t=>t.label.toLocaleLowerCase())];
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
function render(){$('searchClear').hidden=!$('search').value;for(const id of selectedIds)if(!records.some(r=>r.id===id))selectedIds.delete(id);selectedSearchTags=selectedSearchTags.filter(k=>knownTags().some(t=>tagKey(t.label)===k));renderSearchFilters();const query=$('search').value.trim().toLocaleLowerCase();const matches=sortMatches(records.filter(r=>recordMatchesSearch(r,query)));const shown=matches.reduce((n,r)=>n+qty(r),0),total=records.reduce((n,r)=>n+qty(r),0);$('count').textContent=`${shown} SHOWN / ${total} TOTAL`;updateValueCounter();updateBulkBar(matches);$('list').replaceChildren();if(!matches.length){$('list').append(node('div','empty',records.length?'NO MATCHES':'NO DIECASTS YET'));return}for(const r of matches){try{const card=node('article','item'),top=node('div','itemTop'),head=node('div');head.append(node('h3','model',r.model||'(Unnamed model)'),node('p','muted',`${r.brand} · ${r.make}`));if(qty(r)>1)head.append(node('span','copyBadge',`×${qty(r)}`));const actions=node('div','itemActions');if(archiveEditing){const select=node('input','bulkCheckbox');select.type='checkbox';select.checked=selectedIds.has(r.id);select.setAttribute('aria-label',`Select ${r.model||'diecast'}`);select.addEventListener('change',()=>{if(select.checked)selectedIds.add(r.id);else selectedIds.delete(r.id);updateBulkBar();card.classList.toggle('bulkSelected',select.checked)});card.append(select);card.classList.toggle('bulkSelected',select.checked)}const edit=node('button','iconButton',''),del=node('button','iconButton','');edit.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';del.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>';edit.setAttribute('aria-label',`Edit ${r.model}`);del.setAttribute('aria-label',`Delete ${r.model}`);edit.title='Edit';del.title='Delete';del.classList.add('dangerIcon');edit.type=del.type='button';edit.addEventListener('click',()=>openEditor(r.id));del.addEventListener('click',()=>{if(!routineConfirm(`Delete ${r.model||'this diecast'}?`))return;const old=records;records=records.filter(x=>x.id!==r.id);if(!save())records=old;else{selectedIds.delete(r.id);status('Diecast deleted.');render()}});if(archiveEditing)actions.append(edit,del);top.append(head);if(archiveEditing)card.append(actions);const details=node('div','details');const pricing=node('div','cardPricing');if(viewMode!=='compact'&&r.scale){const scale=node('span','itemScale',scaleValue(r.scale));if(scale.textContent)card.append(scale)}for(const k of ['packaging','color','description']){const pair=node('div');pair.append(node('span','label',k),node('span','',r[k]||'—'));details.append(pair)}
if(priceSettings.enabled){for(const [field,title] of [['priceAcquired','PRICE ACQUIRED'],['marketValue','MARKET VALUE']]){const pair=node('div','pricePair');const v=numericPrice(r[field]);const converted=v===null?null:exchange(v,r[field+'Currency']||'PHP');pair.append(node('span','label',title),node('span','',v===null?'—':converted===null?'Rate needed':money(converted,priceSettings.currency)));pricing.append(pair)}}
if(r.image&&viewMode!=='compact'){card.classList.add('withImage');const photo=node('div','photoColumn');const img=node('img','diecastPhoto');img.src=r.image;img.alt=`${r.model} photograph`;img.loading='lazy';img.tabIndex=0;img.setAttribute('role','button');img.title='Open photograph';img.addEventListener('click',()=>openPhotoViewer(r));img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPhotoViewer(r)}});photo.append(img,head);const body=node('div','photoDetails');body.append(details);card.append(photo,body);if(priceSettings.enabled)card.append(pricing);}else {card.append(top,details);if(priceSettings.enabled)card.append(pricing);}
if(viewMode==='compact'&&priceSettings.enabled){
  const field=valueDisplayMode==='market'?'marketValue':'priceAcquired';
  const copies=[r,...copiesOf(r)];let sum=0,missing=0,unconverted=0;
  for(const copy of copies){const v=numericPrice(copy[field]);if(v===null){missing++;continue}const converted=exchange(v,copy[field+'Currency']||'PHP');if(converted===null){unconverted++;continue}sum+=converted}
  const value=node('span','compactItemValue',unconverted?'Rate needed':missing===copies.length?'—':money(sum,priceSettings.currency)+(valueDisplayMode==='market'?' *':''));
  value.title=`${valueDisplayMode==='market'?'Estimated market value':'Acquisition price'}${copies.length>1?' · '+copies.length+' copies':''}${missing?' · '+missing+' missing':''}${unconverted?' · '+unconverted+' missing rates':''}`;
  card.append(value);
}
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
$('list').append(card)}catch(error){console.error('Could not render diecast entry',r?.id,error);const fallback=node('article','item');fallback.append(node('h3','model',String(r?.model||'(Unnamed model)')),node('p','muted',`${r?.brand||''} · ${r?.make||''}`));$('list').append(fallback)}}}
function openEditor(id=null){editingId=id;const current=records.find(r=>r.id===id);editingCopyIndex=-1;$('editorTitle').textContent=current?'Edit diecast':'Add diecast';$('fields').replaceChildren();for(const k of NAMES){const label=node('label','',k[0].toUpperCase()+k.slice(1));const field=k==='description'?document.createElement('textarea'):document.createElement('input');field.name=k;field.value=current?.[k]||'';if(k==='model')field.required=true;if(['brand','make','packaging'].includes(k)){const list=document.createElement('datalist');list.id='suggest-'+k;for(const value of previousSuggestions(k)){const option=document.createElement('option');option.value=value;list.append(option)}field.setAttribute('list',list.id);label.append(field,list)}else label.append(field);$('fields').append(label)}
const scaleLabel=node('label','','Scale');const scaleRow=node('div','scaleInputRow');const prefix=node('span','scalePrefix','1:');const scaleInput=node('input');scaleInput.name='scale';scaleInput.type='text';scaleInput.inputMode='numeric';scaleInput.maxLength=3;scaleInput.placeholder='64';scaleInput.value=scaleDigits(current?.scale);scaleInput.addEventListener('input',()=>{scaleInput.value=scaleDigits(scaleInput.value)});const scaleList=document.createElement('datalist');scaleList.id='scaleSuggestions';for(const digits of ['64','43','32','24','18',...previousSuggestions('scale').map(scaleDigits)]){if(digits&&!Array.from(scaleList.options).some(o=>o.value===digits)){const option=document.createElement('option');option.value=digits;scaleList.append(option)}}scaleInput.setAttribute('list',scaleList.id);scaleRow.append(prefix,scaleInput,scaleList);scaleLabel.append(scaleRow);$('fields').append(scaleLabel);const section=node('fieldset','tagEditor');section.append(node('legend','','ASSIGN TAGS'));
const picker=document.createElement('details');picker.className='tagPickerDropdown';
const summary=document.createElement('summary');summary.className='tagPickerSummary';
const summaryText=node('span','tagPickerSelected');summary.append(summaryText,node('span','tagPickerChevron','▾'));picker.append(summary);
const options=node('div','tagPickerOptions');picker.append(options);
const assigned=new Set(tagsFor(current||{}).map(t=>tagKey(t.label)));
function updateTagSummary(){const chosen=knownTags().filter(t=>assigned.has(tagKey(t.label)));summaryText.replaceChildren();if(chosen.length){const icons=node('span','tagPickerIcons',chosen.map(t=>t.emoji).join(' '));summaryText.append(icons,node('span','tagPickerCount',`${chosen.length} selected`))}else summaryText.append(node('span','tagPickerHint','Select tags'))}
function drawPicker(){options.replaceChildren();const tags=knownTags();if(!tags.length)options.append(node('p','muted','No tags yet. Use + → Tag to create one.'));for(const tag of tags){const choice=document.createElement('button');choice.type='button';choice.className='tagPickerOption';choice.dataset.tagKey=tagKey(tag.label);choice.setAttribute('aria-pressed',String(assigned.has(tagKey(tag.label))));const text=node('span','tagPickerOptionName',`${tag.emoji} ${tag.label}`);const check=node('span','tagPickerCheck',assigned.has(tagKey(tag.label))?'✓':'');choice.append(text,check);choice.addEventListener('click',()=>{const key=tagKey(tag.label);if(assigned.has(key))assigned.delete(key);else assigned.add(key);choice.setAttribute('aria-pressed',String(assigned.has(key)));check.textContent=assigned.has(key)?'✓':'';updateTagSummary()});options.append(choice)}updateTagSummary()}
drawPicker();section.append(picker);$('fields').append(section);
const prices=node('fieldset','priceFields');prices.append(node('legend','','PRICE & VALUE'));for(const [key,title] of [['priceAcquired','Price acquired'],['marketValue','Market value']]){const wrap=node('div','priceInputRow');const label=node('label','',title);const input=node('input');input.name=key;input.type='number';input.step='0.01';input.min='0';input.placeholder='Optional';input.value=current?.[key]??'';label.append(input);const currency=node('input');currency.type='hidden';currency.name=key+'Currency';currency.value=current?.[key+'Currency']||priceSettings.currency;wrap.append(label,currency);prices.append(wrap)}$('fields').append(prices);
pendingCroppedImage=null;let removeMainImage=false;
const imageArea=node('fieldset','imageEditor');imageArea.append(node('legend','','DIECAST IMAGE'));
const imageButtons=node('div','imageChoiceButtons');
const imageInput=node('input');imageInput.type='file';imageInput.accept='image/*';imageInput.id='diecastImageInput';imageInput.hidden=true;
const cameraInput=node('input');cameraInput.type='file';cameraInput.accept='image/*';cameraInput.capture='environment';cameraInput.hidden=true;
const savedInfo=node('p','savedImageInfo',current?.image?`Saved image${current.imageFilename?' · '+current.imageFilename:''}`:'No saved image');
const upload=node('button','imageIconButton','');upload.innerHTML=PHOTO_LIBRARY_ICON;upload.type='button';upload.setAttribute('aria-label','Choose photo');upload.title='Choose photo';upload.onclick=()=>imageInput.click();
const camera=node('button','imageIconButton','');camera.innerHTML=CAMERA_ICON;camera.type='button';camera.setAttribute('aria-label','Take photo');camera.title='Take photo';camera.onclick=()=>cameraInput.click();
imageButtons.append(upload,camera);imageArea.append(imageButtons,imageInput,cameraInput,savedInfo);
const removeRow=node('div','imageRemoveRow');const removeBtn=node('button','dangerIcon','');removeBtn.innerHTML=TRASH_ICON;removeBtn.type='button';removeBtn.title='Remove saved image';removeBtn.setAttribute('aria-label','Remove saved image');removeBtn.onclick=()=>{if(!routineConfirm('Remove the saved image when this diecast is saved?'))return;removeMainImage=true;pendingCroppedImage=null;imageInput.value='';cameraInput.value='';savedInfo.textContent='Image marked for removal';removeRow.hidden=true};removeRow.append(removeBtn);removeRow.hidden=!current?.image;imageButtons.append(removeRow);$('fields').append(imageArea);
function chooseMainImage(f,input){if(!f)return;if(current?.image&&!removeMainImage&&!routineConfirm('Replace image?')){input.value='';return}cropImage(f,blob=>{pendingCroppedImage=blob;removeMainImage=false;savedInfo.textContent=`Selected · ${f.name||'Camera photo'}`;removeRow.hidden=true;imageArea.dataset.filename=f.name||'Camera photo';status('Cropped image ready. Save the diecast to apply.')},()=>{input.value=''})}
imageInput.addEventListener('change',()=>chooseMainImage(imageInput.files?.[0],imageInput));cameraInput.addEventListener('change',()=>chooseMainImage(cameraInput.files?.[0],cameraInput));
$('editorForm').dataset.removeImage='false';removeBtn.addEventListener('click',()=>{$('editorForm').dataset.removeImage='true'});

if(current){const copyArea=node('fieldset','copyEditor');copyArea.append(node('legend','','DUPLICATE COPIES'));const count=node('p','',`${qty(current)} physical diecast(s)`);const addCopy=node('button','imageIconButton','+');addCopy.setAttribute('aria-label','Add duplicate');addCopy.title='Add duplicate';addCopy.type='button';addCopy.addEventListener('click',()=>{const fresh={...Object.fromEntries(NAMES.map(k=>[k,current[k]])),priceAcquired:current.priceAcquired??null,priceAcquiredCurrency:current.priceAcquiredCurrency||'PHP',marketValue:current.marketValue??null,marketValueCurrency:current.marketValueCurrency||'PHP',image:current.image||null,scale:current.scale||'',id:uid()};const next=records.map(r=>r.id===id?{...r,copies:[...copiesOf(r),fresh]}:r);const old=records;records=next;if(!save())records=old;else{render();$('editor').close();openEditor(id)}});const copyHeader=node('div','copyHeader');copyHeader.append(count,addCopy);copyArea.append(copyHeader);copiesOf(current).forEach((c,i)=>{const row=node('div','copyRow');const edit=node('button','',`Edit copy ${i+2}`);edit.type='button';edit.addEventListener('click',()=>openCopyEditor(id,i));const remove=node('button','danger',`Remove ${i+2}`);remove.type='button';remove.addEventListener('click',()=>{if(!routineConfirm(`Delete copy ${i+2}?`))return;const old=records;records=records.map(r=>r.id===id?{...r,copies:copiesOf(r).filter((_,j)=>j!==i)}:r);if(!save())records=old;else{render();$('editor').close();openEditor(id)}});row.append(edit,remove);copyArea.append(row)});$('fields').append(copyArea)}
$('editor').showModal()}

let editingCopyIndex=-1;
function openCopyEditor(recordId,index){const parent=records.find(r=>r.id===recordId),copy=copiesOf(parent)[index];if(!copy)return;$('editor').close();$('copyForm').replaceChildren();$('copyTitle').textContent=`Edit duplicate ${index+2} · ${parent.model}`;
for(const key of [...NAMES,'scale']){const label=node('label','',key[0].toUpperCase()+key.slice(1));const inp=key==='description'?node('textarea'):node('input');inp.name=key;inp.value=key==='scale'?scaleDigits(copy.scale??parent.scale):(copy[key]??parent[key]??'');if(key==='scale'){inp.inputMode='numeric';inp.maxLength=3;inp.addEventListener('input',()=>inp.value=scaleDigits(inp.value));const row=node('div','scaleInputRow');row.append(node('span','scalePrefix','1:'),inp);label.append(row)}else label.append(inp);$('copyForm').append(label)}
for(const key of ['priceAcquired','marketValue']){const label=node('label','',key==='priceAcquired'?'Price acquired':'Market value');const inp=node('input');inp.type='number';inp.min='0';inp.step='0.01';inp.name=key;inp.value=copy[key]??'';label.append(inp);const sel=node('input');sel.type='hidden';sel.name=key+'Currency';sel.value=copy[key+'Currency']||priceSettings.currency;label.append(sel);$('copyForm').append(label)}
let croppedCopyImage=null;const imgLabel=node('div','copyImageControls');const file=node('input');file.type='file';file.accept='image/*';file.name='copyImage';file.hidden=true;file.addEventListener('change',()=>{const f=file.files?.[0];if(f){if(copy.image&&!routineConfirm('Replace image?')){file.value='';return}cropImage(f,blob=>{croppedCopyImage=blob;status('Cropped duplicate image ready.')},()=>{file.value='';croppedCopyImage=null})}});const pickCopy=node('button','imageIconButton','');pickCopy.innerHTML=PHOTO_LIBRARY_ICON;pickCopy.type='button';pickCopy.title='Choose photo';pickCopy.setAttribute('aria-label','Choose photo');pickCopy.onclick=()=>file.click();const cameraCopy=node('input');cameraCopy.type='file';cameraCopy.accept='image/*';cameraCopy.capture='environment';cameraCopy.hidden=true;const takeCopy=node('button','imageIconButton','');takeCopy.innerHTML=CAMERA_ICON;takeCopy.type='button';takeCopy.title='Take photo';takeCopy.setAttribute('aria-label','Take photo');takeCopy.onclick=()=>cameraCopy.click();cameraCopy.addEventListener('change',()=>{const f=cameraCopy.files?.[0];if(f){if(copy.image&&!routineConfirm('Replace image?')){cameraCopy.value='';return}cropImage(f,blob=>{croppedCopyImage=blob;status('Cropped duplicate image ready.')},()=>{cameraCopy.value='';croppedCopyImage=null})}});imgLabel.append(pickCopy,takeCopy,file,cameraCopy);$('copyForm').append(imgLabel);const remove=node('div','imageRemoveRow');const cb=node('input');cb.type='hidden';cb.name='removeImage';cb.value='false';const removeBtn=node('button','dangerIcon','');removeBtn.innerHTML=TRASH_ICON;removeBtn.type='button';removeBtn.title='Remove saved image';removeBtn.onclick=()=>{if(routineConfirm('Remove saved duplicate image when saved?')){cb.value='true';remove.hidden=true}};remove.append(removeBtn,cb);remove.hidden=!copy.image;$('copyForm').append(remove);
const actions=node('div','dialogActions');const cancel=node('button','','✕');cancel.title='Cancel';cancel.setAttribute('aria-label','Cancel');cancel.type='button';cancel.addEventListener('click',()=>{$('copyDialog').close();openEditor(recordId)});const saveBtn=node('button','primary','✓');saveBtn.title='Save';saveBtn.setAttribute('aria-label','Save');saveBtn.type='submit';actions.append(cancel,saveBtn);$('copyForm').append(actions);
$('copyForm').onsubmit=async event=>{event.preventDefault();const form=event.target;const update={...copy};for(const key of NAMES)update[key]=form.elements.namedItem(key).value.trim();update.scale=scaleValue(form.elements.namedItem('scale').value);for(const key of ['priceAcquired','marketValue']){update[key]=numericPrice(form.elements.namedItem(key).value);update[key+'Currency']=form.elements.namedItem(key+'Currency').value}const f=croppedCopyImage||form.elements.namedItem('copyImage').files?.[0];if(f){if(f.size>2*1024*1024){status('Image exceeds 2 MB.',true);return}update.image=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(f)})}else if(form.elements.namedItem('removeImage').value==='true')update.image=null;
const old=records;records=records.map(r=>r.id===recordId?{...r,copies:copiesOf(r).map((c,i)=>i===index?update:c)}:r);if(!save())records=old;else{$('copyDialog').close();render();openEditor(recordId)}};$('copyDialog').showModal()}
function updateValueCounter(){const field=valueDisplayMode==='market'?'marketValue':'priceAcquired';const total=valueTotal(records,field);const counter=$('valueCounter'),toggle=$('valueModeToggle');counter.hidden=!priceSettings.enabled;toggle.hidden=!priceSettings.enabled;counter.replaceChildren();if(priceSettings.enabled){const label=node('span','valueCounterLabel',valueDisplayMode==='market'?'MARKET VALUE:':'ACQUIRED PRICE:');const amount=node('strong','valueCounterAmount',money(total.sum,priceSettings.currency));counter.append(label,amount);if(valueDisplayMode==='market')counter.append(node('strong','valueCounterEstimate','*'));}counter.title=`${total.missing} missing prices, ${total.unconverted} missing exchange rates${valueDisplayMode==='market'?'; * denotes estimated market value':''}`;toggle.title=valueDisplayMode==='market'?'Show acquisition value':'Show market value';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-pressed',String(valueDisplayMode==='market'));}
$('valueModeToggle').addEventListener('click',()=>{valueDisplayMode=valueDisplayMode==='market'?'acquired':'market';try{localStorage.setItem('da-value-display-mode',valueDisplayMode)}catch(_){}updateValueCounter();render()});
function updatePriceSettingsUI(){$('priceCurrencyLabel').textContent=`${priceSettings.currency} – ${CURRENCIES[priceSettings.currency]} – ${({PHP:'Philippine Peso',USD:'US Dollar',EUR:'Euro',JPY:'Japanese Yen',GBP:'British Pound',CAD:'Canadian Dollar',AUD:'Australian Dollar',SGD:'Singapore Dollar',KRW:'South Korean Won',CNY:'Chinese Yuan'})[priceSettings.currency]}`;$('priceTrackerStatus').textContent=priceSettings.enabled?'ENABLED':'DISABLED';$('priceTrackerStatus').classList.toggle('disabled',!priceSettings.enabled);$('priceEnabled').checked=priceSettings.enabled;updateValueCounter()}
function openCurrencyDialog(){$('settingsDialog').close();$('currencyCurrent').value=priceSettings.currency;$('currencyTarget').value=priceSettings.currency;$('currencyRate').value='';$('currencyDialog').showModal()}
$('addBtn').addEventListener('click',()=>$('addMenuDialog').showModal());$('addDiecastChoice').addEventListener('click',()=>{$('addMenuDialog').close();openEditor()});$('addTagChoice').addEventListener('click',()=>{$('addMenuDialog').close();openTagEditor()});$('closeAddMenu').addEventListener('click',()=>$('addMenuDialog').close());$('cancelEdit').addEventListener('click',()=>$('editor').close());$('editorForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(NAMES.map(k=>[k,e.target.elements.namedItem(k).value.trim()]));values.scale=scaleValue(e.target.elements.namedItem('scale').value);for(const key of ['priceAcquired','marketValue']){values[key]=numericPrice(e.target.elements.namedItem(key).value);values[key+'Currency']=e.target.elements.namedItem(key+'Currency').value}const imageFile=pendingCroppedImage||$('diecastImageInput').files?.[0];if(imageFile){if(imageFile.size>2*1024*1024){status('Image exceeds 2 MB. Choose a smaller image.',true);return}values.image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Image read failed'));reader.readAsDataURL(imageFile)});values.imageFilename=$('fields').querySelector('.imageEditor')?.dataset.filename||'image'}else if($('editorForm').dataset.removeImage==='true'){values.image=null;values.imageFilename=null;}values.tags=knownTags().filter(t=>[...e.target.querySelectorAll('.tagPickerOption[aria-pressed="true"]')].some(btn=>btn.dataset.tagKey===tagKey(t.label)));
const old=records;records=editingId?records.map(r=>r.id===editingId?{...r,...values}:r):[...records,{id:uid(),createdAt:new Date().toISOString(),...values}];if(!save()){records=old;return}pendingCroppedImage=null;$('editor').close();status('Diecast saved.');render()});$('search').addEventListener('input',render);
$('searchClear').addEventListener('click',()=>{$('search').value='';render();$('search').focus()});
$('search').addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.isComposing)return;
 e.preventDefault();addSearchKeyword($('search').value);
});
// Tag editor input constraints: one emoji grapheme, and an emoji-free tag name.
const TAG_EMOJI_SEQUENCE=/^(?:(?:\p{Regional_Indicator}{2})|(?:[0-9#*]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*))$/u;
const TAG_EMOJI_IN_NAME=/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[0-9#*]\uFE0F?\u20E3)/u;
function emojiClusters(value){if(typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].map(x=>x.segment);return Array.from(value)}
function validTagEmoji(value){return emojiClusters(value).length===1&&TAG_EMOJI_SEQUENCE.test(value)}
$('tagEmoji').addEventListener('input',()=>{const el=$('tagEmoji');const valid=emojiClusters(el.value).find(validTagEmoji);el.value=valid||'';el.setCustomValidity('')});
$('tagName').addEventListener('input',()=>{const el=$('tagName');el.value=emojiClusters(el.value).filter(part=>!TAG_EMOJI_IN_NAME.test(part)&&!/[\u200D\uFE0F\uFE0E\u20E3]/u.test(part)).join('');el.setCustomValidity('')});
let editingTagKey=null;let returnToBulkTag=false;
function openTagEditor(key=null){editingTagKey=key;const current=tagRegistry.find(t=>tagKey(t.label)===key);$('tagEditorTitle').textContent=current?'Edit tag':'Create tag';$('tagName').value=current?.label||'';$('tagEmoji').value=current?.emoji||'';$('tagDialog').showModal()}
$('cancelTag').addEventListener('click',()=>{$('tagDialog').close();returnToBulkTag=false});
$('tagForm').addEventListener('submit',e=>{e.preventDefault();const rawEmoji=$('tagEmoji').value.trim();if(rawEmoji&&!validTagEmoji(rawEmoji)){status('Please enter one emoji only.',true);$('tagEmoji').focus();return}if(TAG_EMOJI_IN_NAME.test($('tagName').value)){status('Tag name cannot contain emoji.',true);$('tagName').focus();return}const label=$('tagName').value.trim().replace(/\s+/g,' '),emoji=$('tagEmoji').value.trim()||DEFAULT_EMOJI,key=tagKey(label);if(!label)return;const existing=tagRegistry.find(t=>tagKey(t.label)===key);if(existing&&key!==editingTagKey){status('A tag with that name already exists.',true);return}const before=tagRegistry.map(t=>({...t}));const oldRecords=records.map(r=>({...r,tags:tagsFor(r)}));let next=editingTagKey?tagRegistry.map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t):[...tagRegistry,{label,emoji}];next=cleanTags(next);if(!saveRegistry(next))return;if(editingTagKey){records=records.map(r=>({...r,tags:tagsFor(r).map(t=>tagKey(t.label)===editingTagKey?{label,emoji}:t)}));if(!save()){records=oldRecords;saveRegistry(before);return}}
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
function performBulkDelete(){if(busy)return;const ids=selectedSet();if(!ids.size)return;const next=records.filter(r=>!ids.has(r.id));if(updateCatalogue(next,`Deleted ${ids.size} diecast(s).`)){selectedIds.clear();if($('bulkDeleteDialog').open)$('bulkDeleteDialog').close();render()}}
$('bulkDelete').addEventListener('click',()=>{if(!archiveEditing||!selectedIds.size)return;if(!requireConfirmations){performBulkDelete();return}$('bulkDeleteMessage').textContent=`Permanently delete ${selectedIds.size} selected diecast(s)?`;$('bulkDeleteText').value='';$('confirmBulkDelete').disabled=false;$('bulkDeleteDialog').showModal()});
$('bulkDeleteText').addEventListener('input',()=>{});
$('cancelBulkDelete').addEventListener('click',()=>$('bulkDeleteDialog').close());
$('confirmBulkDelete').addEventListener('click',performBulkDelete);
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
function signature(r){return NAMES.map(k=>String(r[k]??'').trim().toLocaleLowerCase()).join('\u0000')}
$('importNotesBtn').addEventListener('click',()=>{$('notesDialog').showModal()});$('closeNotes').addEventListener('click',()=>$('notesDialog').close());$('notesInput').addEventListener('input',()=>{$('confirmImport').disabled=true;pending=[];$('preview').replaceChildren()});function importCounts(){const existing=new Set(records.map(signature)),seen=new Set();let dup=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))dup++;seen.add(sig)}const skip=document.querySelector('input[name="duplicateMode"]:checked').value==='skip';$('importSummary').textContent=`${skip?pending.length-dup:pending.length} will be imported · ${skip?dup:0} skipped`;return dup}
document.querySelectorAll('input[name="duplicateMode"]').forEach(el=>el.addEventListener('change',importCounts));
$('previewBtn').addEventListener('click',()=>{const result=parseNotes($('notesInput').value);pending=result.errors.length?[]:result.parsed;const container=$('preview');container.replaceChildren();$('duplicateOptions').hidden=!pending.length;for(const error of result.errors)container.append(node('p','error',error));if(!result.errors.length){const existing=new Set(records.map(signature)),seen=new Set();let duplicates=0;for(const r of pending){const sig=signature(r);if(existing.has(sig)||seen.has(sig))duplicates++;seen.add(sig);container.append(node('p','',`${r.brand} / ${r.make} / ${r.model} / ${r.color} / ${r.packaging} / ${r.description}`))}container.prepend(node('p','',`${pending.length} valid records · ${duplicates} possible exact duplicates`));importCounts()}$('confirmImport').disabled=!pending.length||!!result.errors.length});
$('confirmImport').addEventListener('click',()=>{if(!pending.length)return;const keep=document.querySelector('input[name="duplicateMode"]:checked').value==='keep',seen=new Set(records.map(signature));const toAdd=pending.filter(r=>{const sig=signature(r);if(!keep&&seen.has(sig))return false;seen.add(sig);return true});const old=records;records=[...records,...toAdd.map(normalize)];if(!save()){records=old;return}const count=toAdd.length,skipped=pending.length-count;pending=[];$('notesDialog').close();$('notesInput').value='';$('preview').replaceChildren();$('duplicateOptions').hidden=true;$('confirmImport').disabled=true;status(`Imported ${count} diecasts${skipped?`; skipped ${skipped} duplicates`:''}.`);render()});
// Backups keep format v2 for compatibility, including tag definitions and assigned tags.
$('exportBtn').addEventListener('click',()=>{
 const localBackupDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 const data=JSON.stringify({format:'diecast-archive',version:2,exportedAt:new Date().toISOString(),records,tags:tagRegistry},null,2);
 const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`diecast-archive-${localBackupDate()}.json`;
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
document.querySelectorAll('input[name="viewMode"]').forEach(el=>el.addEventListener('change',()=>{if(!el.checked)return;viewMode=el.value==='compact'?'compact':'detailed';applyViewMode();render();try{localStorage.setItem(VIEW_KEY,viewMode)}catch(_){status('View preference could not be saved on this device.',true)}}));
applyViewMode();

// Settings-only entry into editing mode; the floating Done control exits it.
$('toggleEditingBtn').addEventListener('click',()=>{if(archiveEditing){setArchiveEditing(false);return;}if(routineConfirm('Would you like to edit your archive?'))setArchiveEditing(true);});
$('doneEditingBtn').addEventListener('click',()=>setArchiveEditing(false));

$('actionConfirmations').addEventListener('change',e=>{const next=e.target.checked;e.target.checked=requireConfirmations;if(!window.confirm(next?'Enable confirmations for routine actions?':'Disable confirmations for routine actions? Delete All and Replace All will still require confirmation.'))return;requireConfirmations=next;try{localStorage.setItem(CONFIRM_KEY,String(next))}catch(_){}syncConfirmUI()});syncConfirmUI();
$('priceCurrencyBtn').addEventListener('click',openCurrencyDialog);
$('priceEnabled').addEventListener('change',e=>{const old=priceSettings.enabled;priceSettings.enabled=e.target.checked;if(!priceSave()){priceSettings.enabled=old;e.target.checked=old}updatePriceSettingsUI();render()});
$('currencyCancel').addEventListener('click',()=>{$('currencyDialog').close();$('settingsDialog').showModal()});
$('currencyApply').addEventListener('click',()=>{const source=priceSettings.currency,target=$('currencyTarget').value,rate=Number($('currencyRate').value);if(!CURRENCIES[target])return;if(target===source){$('currencyDialog').close();$('settingsDialog').showModal();return}if(!Number.isFinite(rate)||rate<=0){$('currencyError').textContent='Enter a positive exchange rate.';return}const old=JSON.parse(JSON.stringify(priceSettings));priceSettings.rates[`${source}_${target}`]=rate;priceSettings.rates[`${target}_${source}`]=1/rate;for(const code of Object.keys(CURRENCIES)){if(code===source||code===target)continue;const cross=priceSettings.rates[`${code}_${source}`];if(Number.isFinite(cross)&&cross>0){priceSettings.rates[`${code}_${target}`]=cross*rate;priceSettings.rates[`${target}_${code}`]=1/(cross*rate)}}priceSettings.currency=target;if(!priceSave()){priceSettings=old;return}updatePriceSettingsUI();$('currencyDialog').close();$('settingsDialog').showModal();render()});
updatePriceSettingsUI();

// Cropping adapted from CA v0.4.14.
function cropImage(file,onDone,onCancel=()=>{}){
 const img=new Image(),source=URL.createObjectURL(file);
 img.onload=()=>{
  URL.revokeObjectURL(source);
  const shade=document.createElement('dialog');shade.className='modalShade cropShade';shade.setAttribute('aria-label','Crop image');
  shade.innerHTML=`<div class="modal"><h2>Crop image</h2><div class="cropSurface"><canvas id="cropCanvas"></canvas><div class="cropSelection" id="cropSelection"><i data-corner="tl"></i><i data-corner="tr"></i><i data-corner="bl"></i><i data-corner="br"></i></div></div><div class="row"><button id="cropRotate" title="Rotate image">⟳</button><button id="cropReset" title="Reset crop">↺</button></div><p class="help">Drag a corner to resize. Drag inside the rectangle to move the crop.</p><div class="actions"><button id="cropCancel" title="Cancel">✕</button><button id="cropSave" title="Save crop">✓</button></div></div>`;
  document.body.append(shade);
  // A native modal enters the browser top layer, above the Add/Edit dialog.
  // This is essential on standalone iOS Safari, where z-index alone cannot
  // put a normal element above a showModal() dialog.
  shade.showModal();
  const dismissCrop=()=>{if(shade.open)shade.close();shade.remove()};
  shade.addEventListener('cancel',e=>{e.preventDefault();onCancel();dismissCrop()});
  const canvas=shade.querySelector('canvas'),ctx=canvas.getContext('2d'),sel=shade.querySelector('#cropSelection');
  let rotation=0,box={x:0,y:0,w:1,h:1},saving=false;
  const draw=()=>{
   const rotated=rotation%180!==0,iw=rotated?img.height:img.width,ih=rotated?img.width:img.height;
   const maxW=Math.min(440,window.innerWidth-68),maxH=Math.min(440,window.innerHeight*.48),scale=Math.min(maxW/iw,maxH/ih,1);
   canvas.width=Math.max(1,Math.round(iw*scale));canvas.height=Math.max(1,Math.round(ih*scale));
   ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
   ctx.drawImage(img,-img.width*scale/2,-img.height*scale/2,img.width*scale,img.height*scale);ctx.restore();position();
  };
  function position(){sel.style.left=(box.x*100)+'%';sel.style.top=(box.y*100)+'%';sel.style.width=(box.w*100)+'%';sel.style.height=(box.h*100)+'%'}
  draw();let drag=null;
  sel.addEventListener('pointerdown',e=>{e.preventDefault();const corner=e.target.dataset.corner||'move';drag={corner,startX:e.clientX,startY:e.clientY,initial:{...box}};sel.setPointerCapture(e.pointerId)});
  sel.addEventListener('pointermove',e=>{
   if(!drag)return;
   const rect=canvas.getBoundingClientRect(),dx=(e.clientX-drag.startX)/rect.width,dy=(e.clientY-drag.startY)/rect.height,b={...drag.initial},min=.07;
   switch(drag.corner){
    case'tl':b.x+=dx;b.y+=dy;b.w-=dx;b.h-=dy;break;
    case'tr':b.y+=dy;b.w+=dx;b.h-=dy;break;
    case'bl':b.x+=dx;b.w-=dx;b.h+=dy;break;
    case'br':b.w+=dx;b.h+=dy;break;
    default:b.x+=dx;b.y+=dy;
   }
   b.w=Math.max(min,Math.min(b.w,1));b.h=Math.max(min,Math.min(b.h,1));
   b.x=Math.max(0,Math.min(b.x,1-b.w));b.y=Math.max(0,Math.min(b.y,1-b.h));
   box=b;position();
  });
  sel.addEventListener('pointerup',()=>drag=null);sel.addEventListener('pointercancel',()=>drag=null);
  shade.querySelector('#cropRotate').onclick=()=>{rotation=(rotation+90)%360;box={x:0,y:0,w:1,h:1};draw()};
  shade.querySelector('#cropReset').onclick=()=>{box={x:0,y:0,w:1,h:1};position()};
  shade.querySelector('#cropCancel').onclick=()=>{onCancel();dismissCrop()};
  shade.querySelector('#cropSave').onclick=async()=>{
   if(saving)return;saving=true;
   try{
    const full=box.x<.00001&&box.y<.00001&&box.w>.99999&&box.h>.99999;
    const rotated=rotation%180!==0,iw=rotated?img.naturalHeight:img.naturalWidth,ih=rotated?img.naturalWidth:img.naturalHeight;
    const cropW=Math.max(1,Math.round(iw*box.w)),cropH=Math.max(1,Math.round(ih*box.h));
    // Balance detail and storage: preserve the crop's original pixels up to
    // 2000px on its long edge, without ever upscaling or using preview pixels.
    const scale=Math.min(1,2000/Math.max(cropW,cropH));
    const out=document.createElement('canvas');
    out.width=Math.max(1,Math.round(cropW*scale));out.height=Math.max(1,Math.round(cropH*scale));
    const outctx=out.getContext('2d');if(!outctx)throw Error('Image processing unavailable');
    outctx.imageSmoothingEnabled=true;outctx.imageSmoothingQuality='high';
    outctx.scale(out.width/cropW,out.height/cropH);
    outctx.translate(-Math.round(iw*box.x),-Math.round(ih*box.y));
    outctx.translate(iw/2,ih/2);outctx.rotate(rotation*Math.PI/180);
    outctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
    const encode=(type,quality)=>new Promise(resolve=>out.toBlob(resolve,type,quality));
    const webp=await encode('image/webp',.88);
    const jpeg=await encode('image/jpeg',.90);
    const candidates=[webp,jpeg].filter(blob=>blob&&blob.size>0&&(blob.type==='image/webp'||blob.type==='image/jpeg'));
    if(!candidates.length){const png=await encode('image/png');if(png)candidates.push(png)}
    if(!candidates.length)throw Error('Image conversion failed');
    candidates.sort((a,b)=>a.size-b.size);
    let result=candidates[0];
    // If nothing changed and the source already fits the resolution budget,
    // prefer the original bytes whenever encoding provides no size saving.
    if(full&&rotation===0&&Math.max(iw,ih)<=2000&&file.size<=result.size)result=file;
    onDone(result);dismissCrop();
   }catch(e){status(e.message||'Image conversion failed',true)}
   finally{saving=false}
  };
 };
 img.onerror=()=>{URL.revokeObjectURL(source);status('Cannot open image',true)};img.src=source;
}


// v0.4.2 — isolated full-screen photograph viewer. Does not alter catalogue records.
const photoViewer=document.getElementById('photoViewer');
const viewerImage=document.getElementById('viewerImage');
const viewerStage=document.getElementById('viewerStage');
let viewerScale=1, viewerX=0, viewerY=0, viewerPointers=new Map(), viewerPinchDistance=0, viewerPinchScale=1, viewerLastTap=0;
function paintViewer(){viewerImage.style.transform=`translate(${viewerX}px,${viewerY}px) scale(${viewerScale})`}
function setViewerZoom(next){viewerScale=Math.max(1,Math.min(5,next));if(viewerScale===1){viewerX=0;viewerY=0}paintViewer()}
function openPhotoViewer(record){
 if(!record.image)return;
 viewerImage.src=record.image;
 viewerImage.alt=`${record.brand} ${record.make} ${record.model}`;
 document.getElementById('viewerInfo').textContent=[record.brand,record.make,record.model].filter(Boolean).join(' · ');
 viewerPointers.clear();viewerX=viewerY=0;setViewerZoom(1);photoViewer.showModal();
}
function closePhotoViewer(){photoViewer.close();viewerPointers.clear();viewerImage.removeAttribute('src')}
document.getElementById('viewerClose').addEventListener('click',closePhotoViewer);
photoViewer.addEventListener('click',e=>{if(e.target===photoViewer)closePhotoViewer()});
photoViewer.addEventListener('close',()=>{viewerPointers.clear();viewerImage.removeAttribute('src')});
viewerStage.addEventListener('dblclick',e=>{e.preventDefault();setViewerZoom(viewerScale>1?1:2.5)});
viewerStage.addEventListener('pointerdown',e=>{
 viewerStage.setPointerCapture(e.pointerId);viewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(viewerPointers.size===2){const p=[...viewerPointers.values()];viewerPinchDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);viewerPinchScale=viewerScale}
 if(e.pointerType==='touch'&&viewerPointers.size===1){const now=Date.now();if(now-viewerLastTap<320){setViewerZoom(viewerScale>1?1:2.5);viewerLastTap=0}else viewerLastTap=now}
});
viewerStage.addEventListener('pointermove',e=>{
 if(!viewerPointers.has(e.pointerId))return;
 const prev=viewerPointers.get(e.pointerId);viewerPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(viewerPointers.size===2){const p=[...viewerPointers.values()];const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(viewerPinchDistance)setViewerZoom(viewerPinchScale*d/viewerPinchDistance)}
 else if(viewerScale>1){viewerX+=e.clientX-prev.x;viewerY+=e.clientY-prev.y;paintViewer()}
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture'])viewerStage.addEventListener(eventName,e=>{viewerPointers.delete(e.pointerId);if(viewerPointers.size<2)viewerPinchDistance=0});
viewerStage.addEventListener('wheel',e=>{e.preventDefault();setViewerZoom(viewerScale*(e.deltaY<0?1.12:0.89))},{passive:false});


// Stable release activation verifier. Keep this release key unchanged in v0.4.4 hotfixes.
const ACTIVATION_RELEASE='v0.4.4-stable';
const ACTIVATION_SALT='9fc32e0bb3f2142981ba4760fe36ab61';
const ACTIVATION_VERIFIER='926fd0790654e5592bfdaa730e81e4d425a8c8a79d7b83616741d9819ddf806b';
const ACTIVATION_KEY='diecast-archive-activation-'+ACTIVATION_RELEASE;
function activationState(){try{return localStorage.getItem(ACTIVATION_KEY)}catch(_){return null}}
function setActivationState(state){try{localStorage.setItem(ACTIVATION_KEY,state);return true}catch(_){return false}}
function refreshActivationSettings(){
 const removed=activationState()==='removed';
 document.getElementById('activationRemoveRow').hidden=removed;
 document.getElementById('activationHelp').hidden=removed;
 document.getElementById('activationRemovedText').hidden=!removed;
 document.getElementById('activationRemove').checked=false;
}
async function activationDigest(password){
 const salt=Uint8Array.from(ACTIVATION_SALT.match(/../g).map(v=>parseInt(v,16)));
 const pw=new TextEncoder().encode(password);
 const input=new Uint8Array(salt.length+pw.length);input.set(salt);input.set(pw,salt.length);
 const digest=await crypto.subtle.digest('SHA-256',input);
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function initializeActivation(){
 refreshActivationSettings();
 const gate=document.getElementById('activationDialog');
 if(activationState()!=='activated'&&activationState()!=='removed')gate.showModal();
 document.getElementById('activationForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const input=document.getElementById('activationPassword');
   const error=document.getElementById('activationError');
   error.textContent='';
   try{
     const match=await activationDigest(input.value)===ACTIVATION_VERIFIER;
     if(!match){error.textContent='Incorrect activation password.';return}
     if(!setActivationState('activated')){error.textContent='Unable to store activation. Check browser storage.';return}
     input.value='';gate.close();refreshActivationSettings();
   }catch(_){error.textContent='Activation verification is unavailable.'}
 });
 gate.addEventListener('cancel',e=>e.preventDefault());
 document.getElementById('activationRemove').addEventListener('change',e=>{
   if(!e.target.checked)return;
   if(!setActivationState('removed')){e.target.checked=false;return}
   refreshActivationSettings();
 });
}
initializeActivation();
