import {esc} from './ui';

/** The bullet is also the keyboard completion control; the whole face fills on drag. */
export function taskFace(id:string,title:string,meta:string,{enabled=true,active=true,review=false}:{enabled?:boolean;active?:boolean;review?:boolean}={}){
 return `<div class="todo-face">${active?`<button type="button" class="completion-handle" data-swipe-complete="${esc(id)}" ${review?'data-swipe-review':''} aria-label="${review?'Choose who completed':'Complete'} ${esc(title)}" title="Slide right, or press Enter" ${enabled?'':'disabled'}><span class="completion-dot" aria-hidden="true"></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6l4 4-4 4m6-8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`:'<span class="todo-archive-mark" aria-hidden="true">−</span>'}<div class="todo-copy"><h3>${esc(title)}</h3><div class="todo-meta">${meta}</div></div><span class="todo-swipe-label" aria-hidden="true">${review?'Choose who helped':'Slide to complete'}</span></div>`;
}
