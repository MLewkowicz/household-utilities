import skies from './observatory-sky-assets.json';
/** The loading/context-loss backdrop is rendered from the same 3D scenery. */
export function observatorySky(){
 return `<picture class="observatory-sky" aria-hidden="true"><source media="(max-width:700px)" srcset="./${skies.phone}"><img src="./${skies.wide}" alt="" decoding="async"></picture>`;
}
