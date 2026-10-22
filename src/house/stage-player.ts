import * as T from 'three';
import { faceCamera, loadBitmojis, placeSpeech, type Faces } from './bitmoji-cast';
import { createStage, type HouseStage } from './house-stages';
import { HOUSE, houseShell } from './cottage-sets';
import { dispose } from './scene-geometry';
import { stages, type StageId, type StageState } from './stage-data';
import { getTheme, observeTheme } from './appearance';
import { createEnvironment } from './environment';
import { createNoticeBoard } from './notice-board';
import { hasUnseenUpdates, onUpdatesSeen, openUpdates } from '../updates';

type Turn = { from: StageId; to: StageId; startYaw: number; direction: number; progress: number; start: number; end: number; began: number; duration: number; dragging: boolean; incoming: boolean };
export async function mountStagePlayer(container: HTMLElement, initial: StageId, onScene: (id: StageId) => void) {
  let requested = initial, displayed = initial, paused = false, visible = true, lost = false, destroyed = false, elapsed = 0;
  let turn: Turn | null = null, yaw = 0, turnDuration = 1800, lastSwap: { progress: number; angle: number; direction: number } | null = null;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const states = Object.fromEntries(stages.map(s => [s.id, { boostUntil: 0, variation: 0, still: false }])) as Record<StageId, StageState>;
  // Keep at least one rendered pixel per CSS pixel, even in software previews.
  // Limit supersampling on Retina displays without softening the whole scene.
  const pixelRatio=()=>Math.max(1,Math.min(devicePixelRatio,2));
  const metrics = { frames: 0, fps: 0, calls: 0, triangles: 0, textures: 0, geometries: 0, active: false, pixelRatio:pixelRatio(), shadowSize:container.clientWidth<700?512:1024, renderer: 'unavailable' };
  const showFallback = (message: string) => {
    container.querySelector('.fallback')?.remove(); const panel = document.createElement('div'); panel.className = 'fallback';
    panel.innerHTML = `<span aria-hidden="true">⌂</span><strong>${message}</strong><p>Choose a section using the tabs above.</p><button>Try again</button>`;
    panel.querySelector('button')!.onclick = () => location.reload(); container.append(panel);
  };
  let renderer: T.WebGLRenderer, faces: Faces;
  try {
    if (new URLSearchParams(location.search).get('webgl') === '0') throw new Error('WebGL unavailable');
    // Supersampling already smooths Retina edges. Avoid stacking multisample
    // antialiasing on top of it; keep MSAA for ordinary-density screens.
    renderer = new T.WebGLRenderer({ alpha: true, antialias: pixelRatio()<1.5, powerPreference: 'default' });
    try { faces = await loadBitmojis(); } catch (error) { renderer.dispose(); throw error; }
  } catch {
    container.replaceChildren(); showFallback('The scene couldn’t load.');
    return {
      setScene(id: StageId) { requested = displayed = id; onScene(id); },
      jumpTo(id: StageId) { requested = displayed = id; },
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
  const canvas = renderer.domElement; canvas.className = 'stage-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Rotating household. Drag horizontally to turn and release to reveal a room. Left and right arrows change sections. Tap the house or press Enter to play its scene effect. Scroll down to enter the selected section. Home returns to this menu.');
  container.replaceChildren(canvas);
  const scene = new T.Scene(), landscapeScene=new T.Scene(), camera = new T.OrthographicCamera(-6, 6, 5, -5, .1, 200);
  // Separate light rigs, but one camera and depth buffer: the rooms retain
  // their scene lighting while the surroundings change to moonlight.
  renderer.autoClear=false;renderer.info.autoReset=false;
  // Same orthographic view, with enough distance for the foreground lawn on
  // tall phones to remain in front of the near clipping plane.
  camera.position.set(24,28.95,99.7); camera.lookAt(0,3.95,.1);
  const cameraAzimuth = Math.atan2(6, 24.9);
  const ambient = new T.HemisphereLight('#fff2dc', '#a2b2bb', 2.5); scene.add(ambient);
  const key = new T.DirectionalLight('#fff1d6', 2.25); key.position.set(-5, 12, 8); key.castShadow = true;
  key.shadow.mapSize.set(metrics.shadowSize,metrics.shadowSize); key.shadow.camera.left=-8; key.shadow.camera.right=8; key.shadow.camera.top=10; key.shadow.camera.bottom=-8;
  key.shadow.camera.near=.5; key.shadow.camera.far=40;
  key.shadow.normalBias=.08; key.shadow.bias=-.0003; scene.add(key);
  const fill = new T.DirectionalLight('#b0cce3', .8); fill.position.set(5, 5, -2); scene.add(fill);
  const outsideAmbient=ambient.clone(),outsideKey=key.clone(),outsideFill=fill.clone();
  outsideKey.shadow.camera.left=-14;outsideKey.shadow.camera.right=14;outsideKey.shadow.camera.top=18;outsideKey.shadow.camera.bottom=-14;outsideKey.shadow.camera.far=55;outsideKey.shadow.camera.updateProjectionMatrix();
  landscapeScene.add(outsideAmbient,outsideKey,outsideFill);
  const environment=createEnvironment(landscapeScene,camera);
  // Only a device that hasn't opened the latest release notes builds the board.
  const board=hasUnseenUpdates()?createNoticeBoard(landscapeScene):null;
  // The house's shadow still lands on the lawn, even though its light is
  // independent. This transparent receiver sits just above the modeled ground.
  const contact=new T.Mesh(new T.PlaneGeometry(45,45),new T.ShadowMaterial({color:'#253a32',opacity:.22}));
  contact.rotation.x=-Math.PI/2;contact.position.y=-.362;contact.receiveShadow=true;scene.add(contact);
  const pivot = new T.Group(); pivot.name='house-turn-pivot'; scene.add(pivot);
  const shell = houseShell(); pivot.add(shell);
  // Tint only outer surfaces in linear light before tone mapping. Keeping them
  // in the house pass preserves shared shadows/occlusion with no extra pass.
  const exteriorLight={value:new T.Vector3(1,1,1)},interiorOpen={value:Number(initial!=='home')};
  function lightExterior(root:T.Group) {
    root.traverse(object=>{
      if(!(object instanceof T.Mesh))return;
      const position=object.geometry.getAttribute('position'),normal=object.geometry.getAttribute('normal');
      const exposure=new Float32Array(position.count).fill(1);
      if(root===shell)for(let i=0;i<position.count;i++) {
        // The inner faces of the shared side walls belong to the lit rooms.
        // Use the shell's unrotated geometry so this holds throughout a turn.
        const x=position.getX(i),y=position.getY(i);
        if(Math.abs(x)>=HOUSE.width/2-.2&&Math.abs(x)<=HOUSE.width/2&&y<HOUSE.eave&&normal.getX(i)*Math.sign(x)<-.9)exposure[i]=0;
      }
      object.geometry.setAttribute('exteriorExposure',new T.BufferAttribute(exposure,1));
      for(const material of Array.isArray(object.material)?object.material:[object.material]) {
        if(!(material instanceof T.MeshLambertMaterial))continue;
        material.onBeforeCompile=shader=>{
          shader.uniforms.exteriorLight=exteriorLight;
          shader.uniforms.interiorOpen=interiorOpen;
          shader.vertexShader=`attribute float exteriorExposure;\nvarying float vExteriorExposure;\n${shader.vertexShader}`.replace('#include <begin_vertex>','#include <begin_vertex>\nvExteriorExposure = exteriorExposure;');
          shader.fragmentShader=`uniform vec3 exteriorLight;\nuniform float interiorOpen;\nvarying float vExteriorExposure;\n${shader.fragmentShader}`.replace('#include <tonemapping_fragment>','float outdoorExposure = mix(1.0, vExteriorExposure, interiorOpen);\ngl_FragColor.rgb *= mix(vec3(1.0), exteriorLight, outdoorExposure);\n#include <tonemapping_fragment>');
        };
        material.customProgramCacheKey=()=>'house-exterior-moonlight';
      }
    });
  }
  lightExterior(shell);
  const cache = new Map<StageId,HouseStage>();
  function get(id: StageId) {
    if(!cache.has(id)) {
      const stage=createStage(id,faces);
      if(stage.exterior)lightExterior(stage.exterior);
      cache.set(id,stage);
    }
    return cache.get(id)!;
  }
  let current = get(initial); pivot.add(current.root);
  let notified=initial;
  function notifySelection(){if(displayed!==notified){notified=displayed;onScene(displayed);}}
  let raf=0, last=0, sampleTime=performance.now(), samples=0;
  let night=Number(current.dark), darkTheme=getTheme()==='dark';
  let themeBlend=Number(darkTheme),themeFrom=themeBlend,themeTarget=themeBlend,themeBegan=elapsed;
  const warm=new T.Color('#fff2dc'), dusk=new T.Color('#a8c0e1'), cool=new T.Color('#a6bcea'), warmKey=new T.Color('#fff1d6'), coolKey=new T.Color('#b0c8ff');
  const portraitTint=new T.Color(), portraitWhite=new T.Color('#ffffff'), portraitNight=new T.Color('#a4b4d1');
  const canAnimate=()=>!destroyed&&!lost&&!paused&&!media.matches&&!document.hidden&&visible;
  function lighting(value: number) {
    night=value;
    exteriorLight.value.set(1-.77*themeBlend,1-.69*themeBlend,1-.54*themeBlend);
    interiorOpen.value=Number(displayed!=='home');
    ambient.intensity=T.MathUtils.lerp(2.5,.75,value);key.intensity=T.MathUtils.lerp(2.25,.55,value);fill.intensity=T.MathUtils.lerp(.8,.4,value);
    ambient.color.copy(warm).lerp(cool,value);key.color.copy(warmKey).lerp(coolKey,value);
    outsideAmbient.intensity=T.MathUtils.lerp(T.MathUtils.lerp(2.5,1.05,themeBlend),.75,value);
    outsideKey.intensity=T.MathUtils.lerp(T.MathUtils.lerp(2.25,1.1,themeBlend),.55,value);
    outsideFill.intensity=T.MathUtils.lerp(T.MathUtils.lerp(.8,.45,themeBlend),.4,value);
    outsideAmbient.color.copy(warm).lerp(dusk,themeBlend).lerp(cool,value);outsideKey.color.copy(warmKey).lerp(coolKey,Math.max(themeBlend,value));
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
    const themeProgress=T.MathUtils.smoothstep((elapsed-themeBegan)/4.5,0,1);
    themeBlend=media.matches?themeTarget:T.MathUtils.lerp(themeFrom,themeTarget,themeProgress);
    lighting(night);environment.tick(elapsed,themeBlend,night,media.matches);board?.tick(elapsed,camera);
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
    renderer.info.reset();renderer.clear();renderer.render(landscapeScene,camera);renderer.render(scene,camera);metrics.frames++;samples++;
    metrics.calls=renderer.info.render.calls; metrics.triangles=renderer.info.render.triangles;
    metrics.textures=renderer.info.memory.textures; metrics.geometries=renderer.info.memory.geometries;
  }
  function directionTo(id: StageId) {
    const from=stages.findIndex(s=>s.id===displayed),to=stages.findIndex(s=>s.id===id),forward=(to-from+stages.length)%stages.length;
    return forward<=stages.length/2?1:-1;
  }
  function begin(id: StageId,direction=directionTo(id),dragging=false) {
    get(id); // Prepare the destination before starting the timed movement.
    // A leftward drag advances the tab order while the front of the house
    // follows the finger left. Logical navigation and physical yaw are opposite.
    turn={ from:displayed,to:id,startYaw:yaw,direction:-direction,progress:0,start:0,end:1,began:performance.now(),duration:turnDuration,dragging,incoming:false };
    container.setAttribute('aria-busy','true');
  }
  function clearTurn() { turn=null; container.removeAttribute('aria-busy'); canvas.classList.remove('dragging'); }
  function finish() {
    if(!turn) return;
    const t=turn, committed=t.end===1;
    yaw=(t.startYaw+(committed?t.direction*Math.PI:0))%(Math.PI*2);
    clearTurn(); pivot.rotation.y=yaw; mount(committed?t.to:t.from,-yaw); lighting(Number(current.dark)); projection();
    notifySelection();
  }
  function settle() {
    if(turn) yaw=(turn.startYaw+(requested===turn.from?0:turn.direction*Math.PI))%(Math.PI*2);
    clearTurn(); pivot.rotation.y=yaw; mount(requested,-yaw); lighting(Number(current.dark)); projection(); notifySelection();
  }
  function setScene(id: StageId,direction?: number) {
    if(turn) return;
    requested=id;
    if(!canAnimate()) { settle(); draw(); return; }
    if(displayed!==id) begin(id,direction); draw();
  }
  function animateTo(end: number,touch=false) {
    if(!turn) return;
    turn.dragging=false; turn.start=turn.progress; turn.end=end; turn.began=performance.now();
    turn.duration=touch?Math.max(220,Math.min(650,turnDuration*Math.abs(end-turn.progress))):Math.max(280,turnDuration*Math.abs(end-turn.progress));
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
        metrics.fps=Math.round(samples*1000/(now-sampleTime));
        samples=0; sampleTime=now;
      }
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
  function adjacent(direction: number) { if(!turn)setScene(neighbor(displayed,direction),direction); }
  function action() { states[requested].boostUntil=elapsed+4; states[requested].variation++; draw(); }
  const tapRay=new T.Raycaster(),tapPoint=new T.Vector2();
  function aim(x:number,y:number) {
    const rect=canvas.getBoundingClientRect();
    tapPoint.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
    tapRay.setFromCamera(tapPoint,camera); return tapRay;
  }
  const hitsHouse=(x:number,y:number)=>aim(x,y).intersectObject(pivot,true).length>0;
  const hitsBoard=(x:number,y:number)=>!!board?.hits(aim(x,y));
  function hover(event: PointerEvent) { if(!pointer&&board) canvas.classList.toggle('over-board',event.pointerType==='mouse'&&hitsBoard(event.clientX,event.clientY)); }
  let pointer: {x:number;y:number;id:number;dragging:boolean;direction:number;at:number;touch:boolean} | null=null;
  function down(event: PointerEvent) {
    if(event.button!==0||turn||pointer) return;
    pointer={x:event.clientX,y:event.clientY,id:event.pointerId,dragging:false,direction:1,at:event.timeStamp,touch:event.pointerType==='touch'};
  }
  function move(event: PointerEvent) {
    if(!pointer||pointer.id!==event.pointerId) return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(!pointer.dragging) {
      if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*(pointer.touch?1.2:1)) { pointer=null; return; }
      if(Math.abs(dx)<(pointer.touch?8:12)||Math.abs(dx)<Math.abs(dy)*(pointer.touch?1.15:1.5)||turn||!canAnimate()) return;
      pointer.dragging=true; pointer.direction=dx<0?1:-1;
      const id=neighbor(displayed,pointer.direction); begin(id,pointer.direction,true); requested=id;
      canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
    }
    if(turn?.dragging) turn.progress=T.MathUtils.clamp(-dx*pointer.direction/(container.clientWidth*(pointer.touch ? .5 : .65)),0,1);
  }
  function up(event: PointerEvent) {
    if(!pointer||pointer.id!==event.pointerId) return;
    const p=pointer,dx=event.clientX-p.x,dy=event.clientY-p.y; pointer=null;
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if(p.dragging&&turn) {
      const distance=-dx*p.direction;
      const fling=distance>=(p.touch?28:44) && distance/Math.max(1,event.timeStamp-p.at)>(p.touch ? .25 : .35);
      // Dragging back past the starting point cancels the original turn.
      const commit=distance>0&&(turn.progress>.25||fling||p.touch&&distance>=Math.max(28,Math.min(44,container.clientWidth*.1)));
      if(!commit) { requested=turn.from; }
      animateTo(commit?1:0,p.touch);
    } else if(Math.abs(dx)>(p.touch?28:45)&&Math.abs(dx)>Math.abs(dy)*(p.touch?1.15:1.5)) adjacent(dx<0?1:-1);
    // Only a short, still press counts as a tap; the board takes it before the house.
    else if(Math.hypot(dx,dy)<10&&event.timeStamp-p.at<500&&!turn) {
      if(hitsBoard(event.clientX,event.clientY)) { canvas.classList.remove('over-board'); openUpdates(); }
      else if(hitsHouse(event.clientX,event.clientY)) action();
    }
  }
  function cancelPointer() {
    pointer=null;
    if(turn?.dragging) { requested=turn.from; animateTo(0); }
  }
  function keyboard(event: KeyboardEvent) {
    if(event.key==='ArrowLeft'||event.key==='ArrowRight') { event.preventDefault(); if(!event.repeat)adjacent(event.key==='ArrowRight'?1:-1); }
    if(event.key==='Enter'||event.key===' ') { event.preventDefault(); if(!turn) action(); }
  }
  function contextLost(event: Event) { event.preventDefault(); lost=true; refresh(); canvas.style.visibility='hidden'; showFallback('The scene needs a moment.'); }
  function contextRestored() { lost=false; canvas.style.visibility=''; container.querySelector('.fallback')?.remove(); refresh(); }
  canvas.addEventListener('pointerdown',down); window.addEventListener('pointermove',move); window.addEventListener('pointerup',up); canvas.addEventListener('pointercancel',cancelPointer); canvas.addEventListener('keydown',keyboard); canvas.addEventListener('pointermove',hover);
  canvas.addEventListener('webglcontextlost',contextLost); canvas.addEventListener('webglcontextrestored',contextRestored);
  media.addEventListener('change',refresh); document.addEventListener('visibilitychange',refresh);
  const ro=new ResizeObserver(resize); ro.observe(container);
  const io=new IntersectionObserver(([entry])=>{ visible=entry.isIntersecting&&entry.intersectionRatio>0; refresh(); },{threshold:.01}); io.observe(container);
  const stopTheme=observeTheme(theme=>{ darkTheme=theme==='dark';themeFrom=themeBlend;themeTarget=Number(darkTheme);themeBegan=elapsed;if(!canAnimate())themeFrom=themeBlend=themeTarget;draw(); });
  lighting(Number(current.dark)); resize();
  // Wait a task so closing the dialog has unpaused the scene before the board leaves.
  const stopUpdates=onUpdatesSeen(()=>setTimeout(()=>{ board?.dismiss(canAnimate()); draw(); }));
  // CSS pixel position of a world point, so tests can tap modeled props.
  function onScreen(point:T.Vector3) { const rect=canvas.getBoundingClientRect(); point.project(camera); return [rect.left+(point.x+1)/2*rect.width,rect.top+(1-point.y)/2*rect.height]; }
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
    diagnostics:()=>({ ...metrics,requested,displayed,paused,reducedMotion:media.matches,transitioning:!!turn,cachedStages:cache.size,theme:darkTheme?'dark':'light',themeBlend,environment:environment.diagnostics(),actors:current.people.map(p=>p.id).sort(),bitmojis:current.people.map(p=>p.head.material.map!.image?.src),actorPoses:current.people.map(p=>({id:p.id,position:p.root.getWorldPosition(new T.Vector3()).toArray(),visible:p.root.visible})),entry:current.root.userData.entry,dark:current.dark,state:{...states[requested]},elapsed,night,seatCount:current.root.userData.seatCount,sceneDetails:{...current.root.userData},speech:speechDetails(),updatesBoard:board?{...board.diagnostics(),screen:onScreen(board.center())}:{visible:false,state:'hidden'},house:{shell:shell.uuid,pivotYaw:pivot.rotation.y,footprint:[HOUSE.width,HOUSE.depth],eave:HOUSE.eave,contentYaw:current.root.rotation.y,turn:turn?{progress:turn.progress,direction:turn.direction,dragging:turn.dragging,incoming:turn.incoming,from:turn.from,to:turn.to,swapAt:.5+cameraAzimuth/(turn.direction*Math.PI)}:null,lastSwap,turnDuration}}),
    destroy() {
      destroyed=true; stopTheme(); stopUpdates(); canvas.removeEventListener('pointermove',hover); clearTurn(); cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); media.removeEventListener('change',refresh); document.removeEventListener('visibilitychange',refresh);
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up); canvas.removeEventListener('pointercancel',cancelPointer); canvas.removeEventListener('pointerdown',down); canvas.removeEventListener('keydown',keyboard);
      canvas.removeEventListener('webglcontextlost',contextLost); canvas.removeEventListener('webglcontextrestored',contextRestored);
      cache.forEach(stage=>dispose(stage.root)); cache.clear(); Object.values(faces).forEach(texture=>texture.dispose()); environment.destroy();dispose(landscapeScene);dispose(scene);key.shadow.dispose();outsideKey.shadow.dispose();renderer.dispose(); renderer.forceContextLoss(); container.replaceChildren();
    },
  };
}
