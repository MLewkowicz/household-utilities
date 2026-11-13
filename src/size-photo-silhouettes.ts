import photos from './size-photo-assets.json';
import {esc} from './ui';
export const photoObjects=photos;
type Photo=(typeof photos)[keyof typeof photos];
let sequence=0;
export function photoSilhouette(shape:string){
 const p=(photos as Record<string,Photo>)[shape.slice(6)];if(!p)return '';
 const b=p.bounds,rotate=p.axis==='height'?b.width>b.height:b.height>b.width,w=rotate?b.height:b.width,h=rotate?b.width:b.height;
 const scale=100/(p.axis==='height'?h:w),x=(100-w*scale)/2,y=100-h*scale,id='photo-mask-'+ ++sequence;
 const transform=`translate(${x} ${y}) scale(${scale}) ${rotate?`translate(${b.height} 0) rotate(90) `:''}translate(${-b.x} ${-b.y})`;
 // The photograph is used only for its alpha channel. Its RGB never appears.
 return `<svg class="size-photo-silhouette" viewBox="0 0 100 100" aria-hidden="true" data-photo="${esc(shape.slice(6))}" data-axis="${p.axis}"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style="mask-type:alpha"><image href="${esc(p.file)}" width="${p.width}" height="${p.height}" transform="${transform}"/></mask></defs><rect class="profile-shape" x="${x}" y="${y}" width="${w*scale}" height="${h*scale}" fill="currentColor" mask="url(#${id})"/></svg>`;
}
export function photoCredit(shape:string){const p=(photos as Record<string,Photo>)[shape.slice(6)];return p?`<a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} · ${esc(p.author)}</a> · <a href="${esc(p.licenseUrl||p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.license)}</a> · rendered as an alpha silhouette`:'';}
