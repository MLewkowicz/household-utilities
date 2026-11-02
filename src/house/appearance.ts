export type Theme='light'|'dark';
export const getTheme=():Theme=>document.documentElement.dataset.theme==='dark'?'dark':'light';
export const getNight=()=>Number(document.documentElement.dataset.houseNight??Number(getTheme()==='dark'));
export const getHour=()=>document.documentElement.dataset.houseClock==='true'?Number(document.documentElement.dataset.houseHour):undefined;
export function observeTheme(listener:(theme:Theme)=>void) {
  const observer=new MutationObserver(()=>listener(getTheme()));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-house-night','data-house-hour','data-house-clock']});
  return ()=>observer.disconnect();
}
