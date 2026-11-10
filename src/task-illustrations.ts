import {$,esc} from './ui';
import {TASK_ICONS,TASK_CATEGORIES,choreIcon,searchTaskIcons,suggestTaskIcon} from './chore-icons';

/** One picker for chores, requests and reminders, including quick reminders. */
export function illustrationPicker(prefix:string){
 return `<div class="task-suggestion" id="${prefix}-suggestion" hidden><p class="field-help">Suggested for your task</p><button type="button" id="${prefix}-suggestion-choice" class="task-suggestion-choice"></button><label class="chore-inline-check"><input type="checkbox" id="${prefix}-suggestion-title" checked> Use suggestion name as task title</label></div><details class="chore-icon-picker"><summary><span id="${prefix}-selected-icon"></span><span>Choose an illustration</span></summary><label class="chore-inline-check"><input type="checkbox" id="${prefix}-fill-title"> Use icon name as the title</label><div class="picker-controls"><input id="${prefix}-icon-search" type="search" aria-label="Search task illustrations" placeholder="Search illustrations"><select id="${prefix}-icon-category" aria-label="Illustration category"><option value="">All categories</option>${TASK_CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div class="chore-icon-grid" id="${prefix}-icon-grid"></div></details>`;
}
export function bindIllustrationPicker(prefix:string,title:HTMLInputElement,onChange:(id:string)=>void){
 const el=<T extends HTMLElement=HTMLElement>(suffix:string)=>$<T>(`#${prefix}-${suffix}`);
 let chosen='tidy',manual=false,candidate:string|undefined;
 const grid=()=>{el('icon-grid').innerHTML=searchTaskIcons(el<HTMLInputElement>('icon-search').value,el<HTMLSelectElement>('icon-category').value).map(i=>`<button type="button" data-picker-icon="${i.id}" aria-label="${esc(i.label)} icon" aria-pressed="${manual&&i.id===chosen}">${choreIcon(i.id)}<span>${esc(i.label)}</span></button>`).join('')||'<p>No illustrations found.</p>';};
 const paint=()=>{el('selected-icon').innerHTML=choreIcon(chosen);grid();onChange(chosen);};
 function suggest(){
  candidate=suggestTaskIcon(title.value);el('suggestion').hidden=!candidate;
  if(candidate){const icon=TASK_ICONS.find(i=>i.id===candidate)!;el('suggestion-choice').innerHTML=`${choreIcon(icon.id)}<span>${esc(icon.label)}</span><span aria-hidden="true">＋</span>`;}
  if(!manual){chosen=candidate||'tidy';paint();}
 }
 function select(id:string,fill:boolean){chosen=id;manual=true;if(fill)title.value=TASK_ICONS.find(i=>i.id===id)!.label;paint();suggest();}
 title.addEventListener('input',suggest);
 el('suggestion-choice').addEventListener('click',()=>{if(candidate)select(candidate,el<HTMLInputElement>('suggestion-title').checked);});
 el('icon-grid').addEventListener('click',event=>{const id=(event.target as HTMLElement).closest<HTMLElement>('[data-picker-icon]')?.dataset.pickerIcon;if(id)select(id,el<HTMLInputElement>('fill-title').checked);});
 el('icon-search').addEventListener('input',grid);el('icon-category').addEventListener('change',grid);
 return {get icon(){return chosen;},suggest,setIcon(id:string){chosen=id;manual=true;paint();suggest();},reset(id?:string){chosen=id||'tidy';manual=!!id;el<HTMLInputElement>('suggestion-title').checked=true;el<HTMLInputElement>('fill-title').checked=false;el<HTMLInputElement>('icon-search').value='';el<HTMLSelectElement>('icon-category').value='';(el('selected-icon').closest('details') as HTMLDetailsElement).open=false;paint();suggest();}};
}
