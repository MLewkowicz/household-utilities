// An original SVG face: geometry and color move continuously with the slider.
const heart='M0 5C-12-3-10-13-4-13-1-13 0-10 0-10S1-13 4-13C10-13 12-3 0 5Z';
function parts(value:number){
 const t=Math.max(-1,Math.min(1,value/100)),rage=Math.max(0,-t),love=Math.max(0,t);
 const color=`rgb(${Math.round(247-12*rage)},${Math.round(212-105*rage-20*love)},${Math.round(168-67*rage+16*love)})`;
 const mouth=`M66 ${100-love*2} Q90 ${100+love*33-rage*23} 114 ${100-love*2}`;
 const browL=`M61 ${68-rage*7} Q71 ${65+rage*2-love*4} 81 ${68+rage*9-love*4}`;
 const browR=`M99 ${68+rage*9-love*4} Q109 ${65+rage*2-love*4} 119 ${68-rage*7}`;
 return{rage,love,color,mouth,browL,browR};
}
export function reactionSVG(value:number,animated=false){
 const p=parts(value);
 return `<svg class="reaction-face ${animated?'is-animated':''}" viewBox="0 0 180 166" aria-hidden="true" focusable="false" style="--rage:${p.rage};--love:${p.love}">
 <ellipse cx="90" cy="149" rx="43" ry="6" fill="#574236" opacity=".08"/>
 <g class="reaction-steam" fill="none" stroke="#c6b7aa" stroke-width="5" stroke-linecap="round"><path class="steam-one" d="M30 85c-20-6 4-15-9-24s3-13 2-18"/><path class="steam-two" d="M150 85c20-6-4-15 9-24s-3-13-2-18"/></g>
 <g class="reaction-rays" fill="none" stroke="#d96c45" stroke-width="3" stroke-linecap="round"><path d="m48 34-6-10m42 4-2-13m36 19 8-11m-65 1-4-7m49 9 3-9"/></g>
 <g class="reaction-head" stroke="#503e38" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">
 <g data-face-skin fill="${p.color}"><ellipse cx="45" cy="91" rx="10" ry="14"/><ellipse cx="135" cy="91" rx="10" ry="14"/><path d="M44 79c-1-31 20-46 46-46s47 15 46 46l-2 24c-2 25-20 38-44 38s-42-13-44-38Z"/></g>
 <path d="M53 51c5-12 17-18 28-17-7-10 7-16 17-10-6 0-7 5-3 9 12-6 25 2 29 11" fill="#6a5145"/>
 <path d="M40 89q7-6 7 5m93-5q-7-6-7 5" fill="none" opacity=".45"/>
 <ellipse cx="61" cy="100" rx="12" ry="7" fill="#df6c69" stroke="none" opacity=".3"/><ellipse cx="119" cy="100" rx="12" ry="7" fill="#df6c69" stroke="none" opacity=".3"/>
 <g class="reaction-eyes" fill="#503e38" stroke="none"><ellipse cx="72" cy="84" rx="3.8" ry="5.3"/><ellipse cx="108" cy="84" rx="3.8" ry="5.3"/></g>
 <g class="reaction-happy-eyes" fill="none"><path d="M66 85q6-8 12 0m24 0q6-8 12 0"/></g>
 <g class="reaction-heart-eyes" fill="#dc4d70" stroke="none"><path d="${heart}" transform="translate(72 87) scale(.7)"/><path d="${heart}" transform="translate(108 87) scale(.7)"/></g>
 <path data-face-brow-l d="${p.browL}" fill="none"/><path data-face-brow-r d="${p.browR}" fill="none"/>
 <path d="m89 87-3 10 6 1" fill="none" opacity=".4"/><path data-face-mouth d="${p.mouth}" fill="none" stroke-width="3.7"/>
 </g>
 <g class="reaction-hearts" fill="#e57490" stroke="#ab4963" stroke-width="1.4"><g class="heart-one"><path d="${heart}" transform="translate(30 52) rotate(-20) scale(.9)"/></g><g class="heart-two"><path d="${heart}" transform="translate(148 44) rotate(18) scale(.8)"/></g><g class="heart-three"><path d="${heart}" transform="translate(140 127) rotate(-10) scale(.5)"/></g></g></svg>`;
}
export function animateReaction(container:HTMLElement){
 let shown=0,target=0,frame=0,previous=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 container.innerHTML=reactionSVG(0,true);
 const svg=container.querySelector<SVGElement>('svg')!;
 const skin=container.querySelector('[data-face-skin]')!;
 const mouth=container.querySelector('[data-face-mouth]')!;
 const browL=container.querySelector('[data-face-brow-l]')!,browR=container.querySelector('[data-face-brow-r]')!;
 function draw(){const p=parts(shown);svg.style.setProperty('--rage',String(p.rage));svg.style.setProperty('--love',String(p.love));skin.setAttribute('fill',p.color);mouth.setAttribute('d',p.mouth);browL.setAttribute('d',p.browL);browR.setAttribute('d',p.browR);}
 function tick(now:number){const elapsed=previous?Math.min(now-previous,64):16;previous=now;shown+=(target-shown)*(1-Math.exp(-elapsed/65));if(Math.abs(target-shown)<.1){shown=target;frame=0;previous=0;draw();return;}draw();frame=requestAnimationFrame(tick);}
 return (value:number,immediate=false)=>{target=value;if(immediate||reduced.matches){cancelAnimationFrame(frame);frame=0;previous=0;shown=value;draw();}else if(!frame)frame=requestAnimationFrame(tick);};
}
