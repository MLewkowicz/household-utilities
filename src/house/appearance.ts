export type Theme='light'|'dark';
export const getTheme=():Theme=>document.documentElement.dataset.theme==='dark'?'dark':'light';
export function observeTheme(listener:(theme:Theme)=>void) {
  const observer=new MutationObserver(()=>listener(getTheme()));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  return ()=>observer.disconnect();
}
