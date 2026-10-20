import type {Member} from './ledger';
import {esc, name} from './ui';
import {AVATAR_ASSETS} from './avatars/catalog';

// Ordinary app tiles use the approved smile without running an animation loop.
// Visible bulletin notes opt into the separate animation module.
export const AVATARS = Object.fromEntries(Object.entries(AVATAR_ASSETS).map(([member,asset])=>[member,{
 src:`./avatars/v1/${asset.happy128}`,
 expressions:{angry:`./avatars/v1/${asset.angry}`,happy:`./avatars/v1/${asset.grateful}`,loving:`./avatars/v1/${asset.loving}`},
}])) as Record<Member,{src:string;expressions:Record<'angry'|'happy'|'loving',string>}>;

export function avatar(member: Member): string {
 const asset = AVATARS[member];
 return `<span class="avatar ${member}" aria-hidden="true"><span class="avatar-fallback">${name(member)[0]}</span>${asset ? `<img src="${esc(asset.src)}" alt="" width="64" height="64" decoding="async" loading="lazy">` : ''}</span>`;
}
