import * as T from 'three';
import { faceCamera, loadBitmojis, placeSpeech, type Faces } from './bitmoji-cast';
import { createStage, type HouseStage } from './house-stages';
import { HOUSE, houseShell } from './cottage-sets';
import { dispose } from './scene-geometry';
import { stages, type StageId, type StageState } from './stage-data';
import { getTheme, observeTheme } from './appearance';

type Turn = { from: StageId; to: StageId; startYaw: number; direction: number; progress: number; start: number; end: number; began: number; duration: number; dragging: boolean; incoming: boolean };
export async function mountStagePlayer(container: HTMLElement, initial: StageId, onScene: (id: StageId) => void) {
  let requested = initial, displayed = initial, paused = false, visible = true, lost = false, destroyed = false, elapsed = 0;
  let turn: Turn | null = null, yaw = 0, turnDuration = 1800, lastSwap: { progress: number; angle: number; direction: number } | null = null;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const states = Object.fromEntries(stages.map(s => [s.id, { boostUntil: 0, variation: 0, still: false }])) as Record<StageId, StageState>;
  let pixelBudget=1_400_000;
  const pixelRatio=()=>Math.min(devicePixelRatio,container.clientWidth<700?1:1.25,Math.sqrt(pixelBudget/Math.max(1,container.clientWidth*container.clientHeight)));
  const metrics = { frames: 0, fps: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, active: false, pixelRatio:pixelRatio(), shadowSize:container.clientWidth<700?512:1024, renderer: 'unavailable' };
  function panelLighting(value: number) {
    container.parentElement?.style.setProperty('--night-level', String(value));
    container.parentElement?.style.setProperty('--night-mix', `${value * 100}%`);
  }
  const showFallback = (message: string) => {
    container.querySelector('.fallback')?.remove(); const panel = document.createElement('div'); panel.className = 'fallback';
    panel.innerHTML = `<span aria-hidden="true">⌂</span><strong>${message}</strong><p>Choose a section using the tabs above.</p><button>Try again</button>`;
    panel.querySelector('button')!.onclick = () => location.reload(); container.append(panel);
  };
  let renderer: T.WebGLRenderer, faces: Faces;
  try {
    if (new URLSearchParams(location.search).get('webgl') === '0') throw new Error('WebGL unavailable');
    renderer = new T.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    try { faces = await loadBitmojis(); } catch (error) { renderer.dispose(); throw error; }
  } catch {
    container.replaceChildren(); showFallback('The scene couldn’t load.');
    return {
      setScene(id: StageId) { requested = displayed = id; panelLighting(Number(id === 'events')); onScene(id); },
      jumpTo(id: StageId) { requested = displayed = id; panelLighting(Number(id === 'events')); },
      setPaused(value: boolean) { paused = value; }, setTurnDuration(_value: number) {}, action() { states[requested].variation++; }, reset() {},
      diagnostics: () => ({ ...metrics, requested, displayed, paused, transitioning: false, actors: [], bitmojis: [], state: states[requested] }),
      destroy() { container.replaceChildren(); },
    };
  }
  renderer.setPixelRatio(metrics.pixelRatio); renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor('#e7e9dd', 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  // The shadow pass must use the same pose as the color pass, including pointer
  // input, replay and still views. Decimating it leaves shadows at an old angle.
  renderer.shadowMap.autoUpdate = true;
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info'); metrics.renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  // Remote previews may rasterize WebGL on the CPU. Keep the HTML/SVG crisp,
  // but start the 3D canvas at a smaller budget on a known software renderer.
  if(/SwiftShader|llvmpipe|Software/i.test(metrics.renderer)){pixelBudget=500_000;metrics.shadowSize=512;}
  const canvas = renderer.domElement; canvas.className = 'stage-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Rotating household. Drag horizontally to turn and release to reveal a room. Left and right arrows change sections. Tap the house or press Enter to play its scene effect. Scroll down to enter the selected section. Home returns to this menu.');
  container.replaceChildren(canvas);
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-6, 6, 5, -5, .1, 90);
  camera.position.set(6, 10.2, 25); camera.lookAt(0, 3.95, .1);
  const cameraAzimuth = Math.atan2(6, 24.9);
  const ambient = new T.HemisphereLight('#fff2dc', '#a2b2bb', 2.5); scene.add(ambient);
  const key = new T.DirectionalLight('#fff1d6', 2.25); key.position.set(-5, 12, 8); key.castShadow = true;
  key.shadow.mapSize.set(metrics.shadowSize,metrics.shadowSize); key.shadow.camera.left=-8; key.shadow.camera.right=8; key.shadow.camera.top=10; key.shadow.camera.bottom=-8;
  key.shadow.camera.near=.5; key.shadow.camera.far=40;
  key.shadow.normalBias=.08; key.shadow.bias=-.0003; scene.add(key);
  const fill = new T.DirectionalLight('#b0cce3', .8); fill.position.set(5, 5, -2); scene.add(fill);
  const floor = new T.Mesh(new T.PlaneGeometry(50,50),new T.ShadowMaterial({ color:'#52644e', opacity:.14 })); floor.rotation.x=-Math.PI/2; floor.position.y=-.39; floor.receiveShadow=true; scene.add(floor);
  const pivot = new T.Group(); pivot.name='house-turn-pivot'; scene.add(pivot);
  const shell = houseShell(); pivot.add(shell);
  const cache = new Map<StageId,HouseStage>();
  function get(id: StageId) { if (!cache.has(id)) cache.set(id,createStage(id,faces)); return cache.get(id)!; }
  let current = get(initial); pivot.add(current.root);
  let notified=initial;
  function notifySelection(){if(displayed!==notified){notified=displayed;onScene(displayed);}}
  let raf=0, last=0, sampleTime=performance.now(), samples=0, slowSamples=0;
  let night=Number(current.dark), darkTheme=getTheme()==='dark';
  const warm=new T.Color('#fff2dc'), dusk=new T.Color('#dce6f2'), cool=new T.Color('#a6bcea'), warmKey=new T.Color('#fff1d6'), coolKey=new T.Color('#b0c8ff');
  const portraitTint=new T.Color(), portraitWhite=new T.Color('#ffffff'), portraitNight=new T.Color('#a4b4d1');
  const canAnimate=()=>!destroyed&&!lost&&!paused&&!media.matches&&!document.hidden&&visible;
  function lighting(value: number) {
    night=value; ambient.intensity=T.MathUtils.lerp(darkTheme?1.8:2.5,.75,value); key.intensity=T.MathUtils.lerp(darkTheme?1.65:2.25,.55,value); fill.intensity=T.MathUtils.lerp(.8,.55,value);
    ambient.color.copy(darkTheme?dusk:warm).lerp(cool,value); key.color.copy(warmKey).lerp(coolKey,value);
    floor.material.color.set(darkTheme?'#080f1b':'#52644e'); floor.material.opacity=T.MathUtils.lerp(darkTheme?.22:.14,.25,value);
    panelLighting(value);
  }
  function projection() {
    const aspect=container.clientWidth/Math.max(1,container.clientHeight);
    const extra=turn ? Math.sin(turn.progress*Math.PI)*1.4 : 0;
    // Leave room around the silhouette and beneath the floating navigation.
    const span=Math.max(13.2,(13.4+extra)/aspect);
    camera.left=-span*aspect/2; camera.right=span*aspect/2; camera.top=span/2; camera.bottom=-span/2; camera.updateProjectionMatrix();
  }
  function mount(id: StageId, orientation: number) {
    const changed=displayed!==id || current.root.rotation.y!==orientation;
    if(displayed!==id) { pivot.remove(current.root); current=get(id); pivot.add(current.root); displayed=id; }
    current.root.rotation.y=orientation;
    if(changed) renderer.shadowMap.needsUpdate=true;
  }
  function applyTurn() {
    if(!turn) return;
    const t=turn, angle=t.direction*Math.PI*t.progress;
    // The visible side wall fills the opening exactly when its normal faces the
    // camera. Only then do the two independent interiors exchange places.
    const crossing=cameraAzimuth+t.direction*Math.PI/2;
    const incoming=t.direction*(angle-crossing)>=0;
    if(incoming!==t.incoming) { t.incoming=incoming; lastSwap={ progress:t.progress,angle,direction:t.direction }; }
    pivot.rotation.y=t.startYaw+angle;
    mount(incoming?t.to:t.from, -(t.startYaw+(incoming?t.direction*Math.PI:0)));
    lighting(T.MathUtils.lerp(Number(get(t.from).dark),Number(get(t.to).dark),T.MathUtils.smoothstep(t.progress,.12,.88)));
    projection();
  }
  function draw() {
    if(destroyed||lost||!visible||document.hidden) return;
    applyTurn();
    const state=states[displayed]; state.still=media.matches;
    current.tick(elapsed,state);
    faceCamera(current.people,camera,portraitTint.copy(portraitWhite).lerp(portraitNight,night).getStyle());
    // Clear captions before the walls cross the opening; reveal them again
    // only in the final few degrees, including when a short drag rolls back.
    const speechOpacity=turn
      ? turn.incoming ? T.MathUtils.smoothstep(turn.progress,.965,1)
        : 1-T.MathUtils.smoothstep(turn.progress,0,.035)
      : 1;
    placeSpeech(current.root,current.people,camera,container.clientHeight,speechOpacity);
    renderer.render(scene,camera); metrics.frames++; samples++;
    metrics.calls=renderer.info.render.calls; metrics.triangles=renderer.info.render.triangles;
    metrics.textures=renderer.info.memory.textures; metrics.geometries=renderer.info.memory.geometries;
  }
  function directionTo(id: StageId) {
    const from=stages.findIndex(s=>s.id===displayed),to=stages.findIndex(s=>s.id===id),forward=(to-from+stages.length)%stages.length;
    return forward<=stages.length/2?1:-1;
  }
  function begin(id: StageId,direction=directionTo(id),dragging=false) {
    get(id); // Prepare the destination before starting the timed movement.
    turn={ from:displayed,to:id,startYaw:yaw,direction,progress:0,start:0,end:1,began:performance.now(),duration:turnDuration,dragging,incoming:false };
    container.setAttribute('aria-busy','true');
  }
  function clearTurn() { turn=null; container.removeAttribute('aria-busy'); canvas.classList.remove('dragging'); }
  function finish() {
    if(!turn) return;
    const t=turn, committed=t.end===1;
    yaw=(t.startYaw+(committed?t.direction*Math.PI:0))%(Math.PI*2);
    clearTurn(); pivot.rotation.y=yaw; mount(committed?t.to:t.from,-yaw); lighting(Number(current.dark)); projection();
    notifySelection();
    if(requested!==displayed) begin(requested);
  }
  function settle() {
    if(turn) yaw=(turn.startYaw+(requested===turn.from?0:turn.direction*Math.PI))%(Math.PI*2);
    clearTurn(); pivot.rotation.y=yaw; mount(requested,-yaw); lighting(Number(current.dark)); projection(); notifySelection();
  }
  function setScene(id: StageId,direction?: number) {
    requested=id;
    if(!canAnimate()) { settle(); draw(); return; }
    if(turn) return;
    if(displayed!==id) begin(id,direction); draw();
  }
  function animateTo(end: number) {
    if(!turn) return;
    turn.dragging=false; turn.start=turn.progress; turn.end=end; turn.began=performance.now();
    turn.duration=Math.max(280,turnDuration*Math.abs(end-turn.progress));
    canvas.classList.remove('dragging');
  }
  function frame(now: number) {
    raf=0; metrics.active=canAnimate(); if(!metrics.active) return;
    // Turn input is sampled once per display frame. Ambient motion uses 30 fps.
    if(now-last>=(turn?15:31)) {
      elapsed+=Math.min((now-last)/1000,.15); last=now;
      if(turn&&!turn.dragging) {
        const p=T.MathUtils.clamp((now-turn.began)/turn.duration,0,1),ease=p*p*p*(p*(p*6-15)+10);
        turn.progress=T.MathUtils.lerp(turn.start,turn.end,ease);
        if(p>=1) finish();
      }
      if(now-sampleTime>1200) {
        metrics.fps=Math.round(samples*1000/(now-sampleTime)); slowSamples=metrics.fps<24?slowSamples+1:0;
        if(slowSamples>=2) {
          pixelBudget=Math.max(450_000,Math.min(pixelBudget,container.clientWidth*container.clientHeight*metrics.pixelRatio**2*Math.min(.8,metrics.fps/28)));
          const next=pixelRatio();if(next!==metrics.pixelRatio){metrics.pixelRatio=next;renderer.setPixelRatio(next);}
          if(metrics.shadowSize>512) { metrics.shadowSize=512;key.shadow.map?.dispose();key.shadow.map=null;key.shadow.mapSize.set(512,512); }
        }
        samples=0; sampleTime=now;
      }
      // Resizing clears the drawing buffer, so apply quality changes before
      // this frame's render rather than exposing an empty canvas for one frame.
      draw();
    }
    raf=requestAnimationFrame(frame);
  }
  function refresh() {
    cancelAnimationFrame(raf); raf=0; metrics.active=canAnimate();
    if(!metrics.active&&turn) settle();
    renderer.shadowMap.needsUpdate=true; draw();
    if(metrics.active) { last=performance.now(); raf=requestAnimationFrame(frame); }
  }
  function resize() {
    const width=container.clientWidth,height=container.clientHeight; if(!width||!height) return;
    metrics.pixelRatio=pixelRatio();
    renderer.setPixelRatio(metrics.pixelRatio);projection(); renderer.setSize(width,height); refresh();
  }
  function neighbor(id: StageId,direction: number) { const index=stages.findIndex(s=>s.id===id); return stages[(index+direction+stages.length)%stages.length].id; }
  function adjacent(direction: number) { setScene(neighbor(requested,direction),direction); }
  function action() { states[requested].boostUntil=elapsed+4; states[requested].variation++; draw(); }
  const tapRay=new T.Raycaster(),tapPoint=new T.Vector2();
  function hitsHouse(x:number,y:number) {
    const rect=canvas.getBoundingClientRect();
    tapPoint.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
    tapRay.setFromCamera(tapPoint,camera);
    return tapRay.intersectObject(pivot,true).length>0;
  }
  let pointer: {x:number;y:number;id:number;dragging:boolean;direction:number;at:number} | null=null;
  function down(event: PointerEvent) {
    if(event.button!==0) return;
    pointer={x:event.clientX,y:event.clientY,id:event.pointerId,dragging:false,direction:1,at:event.timeStamp};
  }
  function move(event: PointerEvent) {
    if(!pointer||pointer.id!==event.pointerId) return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(!pointer.dragging) {
      if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)) { pointer=null; return; }
      if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.5||turn||!canAnimate()) return;
      pointer.dragging=true; pointer.direction=dx<0?1:-1;
      const id=neighbor(displayed,pointer.direction); begin(id,pointer.direction,true); requested=id;
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
    }
    if(turn?.dragging) turn.progress=T.MathUtils.clamp(-dx*pointer.direction/(container.clientWidth*.65),0,1);
  }
  function up(event: PointerEvent) {
    if(!pointer||pointer.id!==event.pointerId) return;
    const p=pointer,dx=event.clientX-p.x,dy=event.clientY-p.y; pointer=null;
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if(p.dragging&&turn) {
      const fling=Math.abs(dx)>=44 && Math.abs(dx)/Math.max(1,event.timeStamp-p.at)>.35;
      const commit=turn.progress>.25||fling;
      if(!commit) { requested=turn.from; }
      animateTo(commit?1:0);
    } else if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5) adjacent(dx<0?1:-1);
    else if(Math.hypot(dx,dy)<10&&event.timeStamp-p.at<500&&!turn&&hitsHouse(event.clientX,event.clientY)) action();
  }
  function cancelPointer() {
    pointer=null;
    if(turn?.dragging) { requested=turn.from; animateTo(0); }
  }
  function keyboard(event: KeyboardEvent) {
    if(event.key==='ArrowLeft'||event.key==='ArrowRight') { event.preventDefault(); adjacent(event.key==='ArrowRight'?1:-1); }
    if(event.key==='Enter'||event.key===' ') { event.preventDefault(); if(!turn) action(); }
  }
  function contextLost(event: Event) { event.preventDefault(); lost=true; refresh(); canvas.style.visibility='hidden'; showFallback('The scene needs a moment.'); }
  function contextRestored() { lost=false; canvas.style.visibility=''; container.querySelector('.fallback')?.remove(); refresh(); }
  canvas.addEventListener('pointerdown',down); window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); canvas.addEventListener('pointercancel',cancelPointer); canvas.addEventListener('keydown',keyboard);
  canvas.addEventListener('webglcontextlost',contextLost); canvas.addEventListener('webglcontextrestored',contextRestored);
  media.addEventListener('change',refresh); document.addEventListener('visibilitychange',refresh);
  const ro=new ResizeObserver(resize); ro.observe(container);
  const io=new IntersectionObserver(([entry])=>{ visible=entry.isIntersecting&&entry.intersectionRatio>0; refresh(); },{threshold:.01}); io.observe(container);
  const stopTheme=observeTheme(theme=>{ darkTheme=theme==='dark'; lighting(night); draw(); });
  lighting(Number(current.dark)); resize();
  function speechDetails() {
    const bubbles: { speaker: string; message: string; visible: boolean; opacity: number }[] = [];
    current.root.traverse(object => {
      if (object instanceof T.Sprite && object.userData.message)
        bubbles.push({speaker:object.userData.speaker,message:object.userData.message,visible:object.visible,opacity:object.material.opacity});
    });
    return bubbles;
  }
  return {
    setScene,action,
    jumpTo(id:StageId) {
      if(pointer&&canvas.hasPointerCapture(pointer.id))canvas.releasePointerCapture(pointer.id);
      pointer=null;requested=notified=id;settle();draw();
    },
    setPaused(value:boolean) { paused=value; refresh(); },
    setTurnDuration(value:number) { turnDuration=value; },
    reset() { states[requested]={ boostUntil:0,variation:0,still:media.matches }; elapsed=0; settle(); refresh(); },
    diagnostics:()=>({ ...metrics,requested,displayed,paused,reducedMotion:media.matches,transitioning:!!turn,cachedStages:cache.size,theme:darkTheme?'dark':'light',actors:current.people.map(p=>p.id).sort(),bitmojis:current.people.map(p=>p.head.material.map!.image?.src),actorPoses:current.people.map(p=>({id:p.id,position:p.root.getWorldPosition(new T.Vector3()).toArray(),visible:p.root.visible})),entry:current.root.userData.entry,dark:current.dark,state:{...states[requested]},elapsed,night,seatCount:current.root.userData.seatCount,sceneDetails:{...current.root.userData},speech:speechDetails(),house:{shell:shell.uuid,pivotYaw:pivot.rotation.y,footprint:[HOUSE.width,HOUSE.depth],eave:HOUSE.eave,contentYaw:current.root.rotation.y,turn:turn?{progress:turn.progress,direction:turn.direction,dragging:turn.dragging,incoming:turn.incoming,from:turn.from,to:turn.to,swapAt:.5+cameraAzimuth/(turn.direction*Math.PI)}:null,lastSwap,turnDuration}}),
    destroy() {
      destroyed=true; stopTheme(); clearTurn(); cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); media.removeEventListener('change',refresh); document.removeEventListener('visibilitychange',refresh);
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); canvas.removeEventListener('pointercancel',cancelPointer); canvas.removeEventListener('pointerdown',down); canvas.removeEventListener('keydown',keyboard);
      canvas.removeEventListener('webglcontextlost',contextLost); canvas.removeEventListener('webglcontextrestored',contextRestored);
      cache.forEach(stage=>dispose(stage.root)); cache.clear(); Object.values(faces).forEach(texture=>texture.dispose()); dispose(scene); renderer.dispose(); renderer.forceContextLoss(); container.replaceChildren();
    },
  };
}
