import {HOUSE_SECTIONS,sceneFor,routeFor,type Section} from './house-navigation';
type Player=Awaited<ReturnType<typeof import('./house/stage-player').mountStagePlayer>>;

/** The ordinary router stays usable before WebGL loads, and if it fails. */
export function mountHouseEntry(onNavigate:(section:Section)=>void) {
  const container=document.querySelector<HTMLElement>('#house-stage')!;
  const hero=document.querySelector<HTMLElement>('#house-hero')!;
  let selected:Section='home',player:Player|undefined,loading=false,inView=false,syncPending=true;
  const modalOpen=()=>Boolean(document.querySelector('dialog[open]'));
  const skyVisibility=()=>{hero.dataset.skyPaused=String(!inView||document.hidden||modalOpen());};
  document.addEventListener('visibilitychange',skyVisibility);
  const dialogs=new MutationObserver(changes=>{
    if(!changes.some(change=>(change.target as Element).tagName==='DIALOG'))return;
    skyVisibility();player?.setPaused(Boolean(hero.hidden)||modalOpen());
  });
  dialogs.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  function featureMode(value:boolean) {
    if(hero.hidden===value)return;
    hero.hidden=value;
    if(value)inView=false;
    skyVisibility();
    player?.setPaused(value||modalOpen());
  }
  function finishEntering() {
    if(hero.hidden||selected==='home'||hero.getBoundingClientRect().bottom>0)return;
    const position=Math.max(0,scrollY-hero.offsetHeight);
    syncPending=true;
    featureMode(true);
    history.replaceState({...history.state,houseView:false},'');
    window.scrollTo({top:position,behavior:'instant'});
    if(container.contains(document.activeElement))document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true});
  }
  window.addEventListener('scroll',finishEntering,{passive:true});
  async function start() {
    if(loading||player)return;
    loading=true;
    try {
      const {mountStagePlayer}=await import('./house/stage-player');
      if(!inView){loading=false;return;}
      player=await mountStagePlayer(container,sceneFor(selected),scene=>{if(!syncPending)onNavigate(routeFor(scene));});
      player.setPaused(Boolean(hero.hidden)||modalOpen());
      if(inView){player.jumpTo(sceneFor(selected));syncPending=false;}
      container.dataset.ready='true';
    } catch {
      container.innerHTML='<p class="house-unavailable">Use the tabs to explore your household.</p>';
      container.dataset.ready='fallback';
    }
  }
  const observer=new IntersectionObserver(entries=>{
    inView=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0);
    skyVisibility();
    if(inView){
      if(player&&syncPending){player.jumpTo(sceneFor(selected));syncPending=false;}
      else void start();
    }
  },{threshold:.01});
  observer.observe(container);
  Object.assign(window,{__houseDiagnostics:()=>({selected,loaded:!!player,featureOnly:hero.hidden,...player?.diagnostics()})});
  return {
    select(section:Section,fromHouse=false,featureOnly=false) {
      selected=section;
      syncPending=!fromHouse;
      featureMode(featureOnly);
      if(!fromHouse&&!featureOnly&&inView&&player){player.jumpTo(sceneFor(section));syncPending=false;}
      const current=document.querySelector<HTMLElement>('#house-current');
      if(current)current.textContent=HOUSE_SECTIONS.find(item=>item.route===section)!.label;
    },
    destroy(){window.removeEventListener('scroll',finishEntering);document.removeEventListener('visibilitychange',skyVisibility);observer.disconnect();dialogs.disconnect();player?.destroy();},
  };
}
