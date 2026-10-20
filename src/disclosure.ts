import {esc} from './ui';

export function info(label: string, content: string): string {
 return `<details class="info-disclosure"><summary aria-label="${esc(label)}"><span aria-hidden="true">i</span></summary><div class="info-content">${content}</div></details>`;
}

export function initDisclosures() {
 document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const open = document.activeElement?.closest<HTMLDetailsElement>('.info-disclosure[open]');
  if (open) { open.open = false; open.querySelector('summary')?.focus(); event.preventDefault(); event.stopPropagation(); }
 });
 document.addEventListener('toggle', event => {
  const details=event.target as HTMLDetailsElement;
  if(!details.matches('.info-disclosure')||!details.open)return;
  const content=details.querySelector<HTMLElement>('.info-content')!;
  content.style.transform='';const rect=content.getBoundingClientRect();
  const shift=Math.max(0,12-rect.left)+Math.min(0,innerWidth-12-rect.right);
  content.style.transform=`translateX(${shift}px)`;
 }, true);
 document.addEventListener('click', event => {
  document.querySelectorAll<HTMLDetailsElement>('.info-disclosure[open]').forEach(el => {
   if (!el.contains(event.target as Node)) el.open = false;
  });
 });
 // A failed future avatar asset leaves its already-rendered fallback visible.
 document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.closest('.avatar')) event.target.hidden = true;
 }, true);
}
