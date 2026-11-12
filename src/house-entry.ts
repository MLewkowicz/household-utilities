import {HOUSE_SECTIONS,sceneFor,routeFor,type Section} from './house-navigation';
type Player=Awaited<ReturnType<typeof import('./house/stage-player').mountStagePlayer>>;

/** The ordinary router stays usable before WebGL loads, and if it fails. */
export function mountHouseEntry(onNavigate:(section:Section)=>void,onEnter:(section:Section)=>void) {
  const container=document.querySelector<HTMLElement>('#house-stage')!;
  const hero=document.querySelector<HTMLElement>('#house-hero')!;
  const chrome=document.querySelector<HTMLElement>('.house-chrome')!;
  const syncChrome=()=>chrome.classList.toggle('is-docked',Boolean(hero.hidden)||scrollY>8);
  let selected:Section='home',player:Player|undefined,loading=false,inView=false,syncPending=true,returning=false;
  let returnIdle:ReturnType<typeof setTimeout>|undefined,returnStart=0;
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
    syncChrome();
    if(value)inView=false;
    skyVisibility();
    player?.setPaused(value||modalOpen());
  }
  function finishEntering() {
    if(returning||hero.hidden||hero.getBoundingClientRect().bottom>0)return;
    const position=Math.max(0,scrollY-hero.offsetHeight);
    syncPending=true;
    featureMode(true);
    history.replaceState({...history.state,houseView:false},'');
    window.scrollTo({top:position,behavior:'instant'});
    onEnter(selected==='home'?'chores':selected);
    if(container.contains(document.activeElement))document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true});
  }
  function onScroll(){
    if(returning){
      clearTimeout(returnIdle);
      if(scrollY<=1)returning=false;
      // Reinserting the hero emits a scroll at the start position. Wait for
      // actual movement before detecting an interrupted return: a slow first
      // WebGL frame must not let the idle timer hide the hero again.
      else if(scrollY!==returnStart)returnIdle=setTimeout(()=>{returning=false;finishEntering();},180);
    }
    finishEntering();syncChrome();
  }
  window.addEventListener('scroll',onScroll,{passive:true});syncChrome();
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
    setSkyLift(amount:number){player?.setSkyLift(amount);},
    returnToScene() {
      if(!hero.hidden||returning)return;
      // Reinsert the scene above the same content position before scrolling.
      // Suppress entry detection until the return has reached the lawn.
      returning=true;syncPending=true;
      const position=scrollY;
      featureMode(false);
      history.pushState({...history.state,houseView:true},'');
      window.scrollTo({top:hero.offsetHeight+position,behavior:'instant'});
      returnStart=scrollY;
      if(container.contains(document.activeElement)===false)document.querySelector<HTMLElement>('[data-ledger="'+selected+'"]')?.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      if(scrollY<=1)returning=false;
    },
    select(section:Section,fromHouse=false,featureOnly=false) {
      returning=false;selected=section;
      syncPending=!fromHouse;
      featureMode(featureOnly);
      if(!fromHouse&&!featureOnly&&inView&&player){player.jumpTo(sceneFor(section));syncPending=false;}
      const current=document.querySelector<HTMLElement>('#house-current');
      if(current)current.textContent=section==='games'?'Games':HOUSE_SECTIONS.find(item=>item.route===section)!.label;
    },
    destroy(){clearTimeout(returnIdle);window.removeEventListener('scroll',onScroll);document.removeEventListener('visibilitychange',skyVisibility);observer.disconnect();dialogs.disconnect();player?.destroy();},
  };
}
