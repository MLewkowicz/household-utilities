import type {SizeCategory} from './size-categories';
type Profile={art:string;axis:string;source:string;author:string;license:string;licenseUrl?:string;creditUrl?:string;bounds:{width:number;height:number}};
const catalog:Record<string,Profile>={};
const loading=new Map<SizeCategory,Promise<void>>(),ready=new Set<SizeCategory>();
const loaders={classic:()=>import('./size-catalog/classic.json'),'pop-culture':()=>import('./size-catalog/pop-culture.json'),geography:()=>import('./size-catalog/geography.json')};
export const sizeCatalogReady=(category:SizeCategory)=>ready.has(category);
export function loadSizeCatalog(category:SizeCategory){
 let task=loading.get(category);
 if(!task){task=loaders[category]().then(module=>{Object.assign(catalog,module.default);ready.add(category);}).catch(error=>{loading.delete(category);throw error;});loading.set(category,task);}
 return task;
}
const escape=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
export function silhouetteCredit(shape:string){const p=shape.startsWith('catalog:')?catalog[shape.slice(8)]:undefined;return p?.author==='Household'?'Original Household schematic · CC0':p?`<a href="${escape(p.source)}" target="_blank" rel="noopener noreferrer">${escape(p.author)}</a> · ${p.licenseUrl?`<a href="${escape(p.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(p.license)}</a>`:escape(p.license)} · adapted silhouette${p.creditUrl?` · <a href="${escape(p.creditUrl)}" target="_blank" rel="noopener noreferrer">Artwork credits</a>`:''}`:'';}
export function sizeSilhouette(shape:string){
 const p=shape.startsWith('catalog:')?catalog[shape.slice(8)]:undefined;
 if(p){const left=50-p.bounds.width/2-6;return `<svg viewBox="0 0 100 100" data-profile="${escape(shape.slice(8))}" data-axis="${p.axis}" aria-hidden="true" preserveAspectRatio="xMidYMax meet"><g class="profile-shape" fill="currentColor">${p.art}</g><path class="size-dimension" d="${p.axis==='height'?`M${left} 0V100M${left-3} 0h6M${left-3} 100h6`:'M0 108H100M0 105v6M100 105v6'}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;}
 throw new Error('This silhouette is unavailable. Reload the board.');
}
