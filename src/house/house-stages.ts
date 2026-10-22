import * as T from 'three';
import { actor, reach, speech, type CastMember, type Faces } from './bitmoji-cast';
import { ball, batch, box, cylinder, group, line, mesh, movable, ring } from './scene-geometry';
import { bookcase, chair, cottageExterior, framedPicture, loft, plant, roomSet, sofa, utilityHouse, window as houseWindow } from './cottage-sets';
import { members, type StageId, type StageState } from './stage-data';

export interface HouseStage {
  id: StageId; root: T.Group; people: CastMember[]; dark: boolean;
  exterior?: T.Group;
  tick(time: number, state: StageState): void;
}
function make(id: StageId, root: T.Group, people: CastMember[], tick: HouseStage['tick'], dark = false): HouseStage {
  batch(root); root.name = `${id}-independent-stage`;
  return { id, root, people, tick, dark };
}
function sleeveWave(person: CastMember, t: number, intensity = 1) {
  person.rightArm.rotation.z = 2.25 + Math.sin(t * 3) * .32 * intensity;
  person.leftArm.rotation.z = -.14; person.root.rotation.z = Math.sin(t * 1.8) * .025;
}
function home(faces: Faces) {
  // Keep the facade separate when batching so moonlight can dim the building
  // without dimming the people or any of the independent room scenes.
  const root = new T.Group(), exterior = group(root, 0, 0, 0, true), door = cottageExterior(exterior);
  const waitingX = [-2.50, -1.45, 1.45, 2.50];
  const people = members.map((id, i) => actor(root, faces, id, waitingX[i], 3.35, { scale: .83 }));
  const ease = (value: number) => T.MathUtils.smoothstep(value, 0, 1);
  const stage = make('home', root, people, (time, state) => {
    const loop = time % 45, returning = loop > 22.5;
    const cycle = returning ? 45 - loop : loop;
    const slot = cycle % 5.3;
    const inSequence = cycle < 21.2;
    // The door opens before a person reaches the stairs and remains open until
    // their entire body is behind the facade. Arrival poses are time-deterministic.
    const opening = ease((slot - 1.05) / .65), closing = 1 - ease((slot - 4.6) / .55);
    door.rotation.y = state.still ? (state.variation ? 1.65 : 0) : inSequence ? 1.65 * opening * closing : 0;
    if (time < state.boostUntil) door.rotation.y = 1.65;
    people.forEach((person, i) => {
      const local = cycle - i * 5.3;
      let x = waitingX[i], z = 3.35, y = 0;
      const walking = local > 0 && local < 4.6 && !state.still;
      if (local >= 0 && !state.still) {
        if (local < 1.8) {
          const p = ease(local / 1.8); x *= 1 - p; z += Math.sin(p * Math.PI) * .12;
        } else {
          const p = T.MathUtils.clamp((local - 1.8) / 2.8, 0, 1);
          x = 0; z = 3.35 - p * 4.1;
          y = z > 3.05 ? 0 : z > 2.73 ? .13 : z > 2.41 ? .26 : .40;
        }
      }
      person.root.position.set(x, y, z);
      person.root.visible = state.still || local < 4.6;
      person.root.rotation.y = walking ? returning ? 0 : Math.PI : 0;
      person.legs.forEach((leg, k) => leg.rotation.x = walking ? Math.sin(time * 10 + k * Math.PI) * .32 : 0);
      person.leftArm.rotation.x = walking ? Math.sin(time * 10) * .20 : 0;
      person.rightArm.rotation.z = walking ? .12 : 2 + Math.sin(time * 2 + i) * .2;
      person.root.userData.arrival = local < 0 ? 'waiting' : local < 1.8 ? returning ? 'returning to the path' : 'approaching' : local < 4.6 ? returning ? 'leaving' : 'entering' : 'inside';
    });
    root.userData.entry = { doorAngle: door.rotation.y, thresholdZ: 1.88, openingWidth: 1.3, direction: returning ? 'out' : 'in', loopSeconds: 45 };
  });
  stage.exterior = exterior;
  return stage;
}
function utilities(faces: Faces) {
  const root = new T.Group();
  const [bath, lounge, boiler, laundry] = utilityHouse(root);
  // Upstairs bathroom: tiles, washbasin, towel, toilet and a tiny medicine cabinet.
  box(bath, '#b4cfc1', 3.80, .02, 3.35, 0, .012, -.05);
  for (let x = 0; x < 6; x++) for (let z = 0; z < 5; z++) box(bath, (x + z) % 2 ? '#e8edda' : '#a7c5b7', .60, .012, .62, -1.55 + x * .62, .03, -1.34 + z * .65);
  box(bath, '#bad5c8', 3.80, 1.35, .025, 0, .72, -1.78);
  for (let i = 0; i < 4; i++) box(bath, '#e7ebdb', 3.75, .018, .025, 0, .23 + i * .31, -1.76);
  houseWindow(bath, -.9, 1.89, -1.75, .86, 1.01);
  box(bath, '#e8dfc5', .85, .68, .58, .93, .40, -1.37);
  ball(bath, '#faf1df', .48, .08, .34, .93, .79, -1.34);
  ball(bath, '#a8c6c2', .30, .015, .20, .93, .86, -1.28);
  line(bath, '#a9b0a0', [[.93,.87,-1.55],[.93,1.13,-1.55],[.93,1.13,-1.36]], .025);
  box(bath, '#d8c6a0', .68, .78, .09, .93, 1.78, -1.7);
  box(bath, '#b5cccb', .56, .66, .02, .93, 1.78, -1.64);
  line(bath, '#ad9467', [[-.05,1.18,-1.7],[.45,1.18,-1.7]], .025);
  box(bath, '#f3dca9', .32, .46, .04, .16, .99, -1.66);
  const toilet = group(bath, .30, .04, .60);
  cylinder(toilet, '#f7f0db', .23, .42, 0, .22, 0, .27); ball(toilet, '#fbf5e5', .37, .18, .44, 0, .52, .08);
  const seat = ring(toilet, '#e6e9d9', .27, .065, 0, .64, .08); seat.rotation.x = -Math.PI / 2; seat.scale.y = 1.2;
  ball(toilet, '#8bc1c9', .23, .02, .29, 0, .64, .09);
  box(toilet, '#f6f0df', .55, .65, .22, 0, .70, -.36); box(toilet, '#e7e6d8', .59, .065, .28, 0, 1.06, -.36);
  const plunger = group(bath, .30, .74, .67, true); plunger.rotation.z = .38;
  const cup = mesh(plunger, new T.SphereGeometry(.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#a15e4c'); cup.scale.y = .6;
  cylinder(plunger, '#bb9464', .034, .58, 0, .37); ball(plunger, '#d4b07b', .05, .045, .05, 0, .68);
  const michal = actor(bath, faces, 'michal', -.63, .83); michal.root.rotation.y = .6;
  // The other upstairs room has a sofa, lamp and a switch on its return wall.
  houseWindow(lounge, .25, 1.94, -1.75, 1.2, 1.05);
  sofa(lounge, .45, -1.10, 1.65, '#a4b198');
  box(lounge, '#e1d5b9', .72, 2.0, .14, .15, 1.02, .12);
  const switchPanel = group(lounge, -.12, 1.28, .23);
  box(switchPanel, '#fff0d5', .25, .36, .045);
  const rocker = movable(box(switchPanel, '#8e9e8c', .11, .18, .05, 0, 0, .045));
  const rina = actor(lounge, faces, 'rina', -.85, .80);
  cylinder(lounge, '#9b946c', .21, .06, 1.35, .08, .52); cylinder(lounge, '#b9a572', .035, 1.83, 1.35, 1.02, .52);
  const shade = movable(cylinder(lounge, '#edc75f', .4, .43, 1.35, 1.99, .52, .23));
  const pool = movable(mesh(lounge, new T.CircleGeometry(.9, 28), '#f9d673', .95, .055, .52)); pool.rotation.x = -Math.PI / 2;
  pool.material.transparent = true; pool.material.opacity = .2; pool.material.depthWrite = false; pool.castShadow = false;
  plant(lounge, 1.45, -1.20, .1, .8);
  // Downstairs boiler room: copper runs, meter, storage, toolbox and the suspect valve.
  cylinder(boiler, '#acb9b1', .40, 1.52, -.90, .82, -1.12); ball(boiler, '#d6d8c6', .4, .14, .4, -.90, 1.58, -1.12);
  box(boiler, '#5d7c79', .32, .43, .05, -.90, 1.04, -.70);
  line(boiler, '#b18c62', [[-.90,1.7,-1.12],[-.90,2.28,-1.12],[.10,2.28,-1.12],[.1,.50,-1.12]], .065);
  const valve = group(boiler, .10, 1.29, -.95, true); ring(valve, '#a2694a', .17, .028);
  box(valve, '#a2694a', .32, .025, .025); box(valve, '#a2694a', .025, .32, .025);
  cylinder(boiler, '#d6ceaf', .14, .06, -.89, 1.28, -.69).rotation.x = Math.PI / 2;
  line(boiler, '#514f47', [[-.89,1.28,-.65],[-.83,1.35,-.65]], .012);
  const ohm = actor(boiler, faces, 'ohm', .14, .70);
  // The grip sits in the palm; the shaft and open jaw extend beyond the fingers,
  // away from the wrist. Keep the assembly attached to the moving hand.
  const wrench = group(ohm.rightArm, 0, -.405, .06, true); wrench.name = 'ohm-wrench';
  box(wrench, '#81999b', .055, .30, .05, 0, -.15);
  box(wrench, '#afbeb5', .023, .22, .008, 0, -.15, .029);
  const jaw = mesh(wrench, new T.TorusGeometry(.09, .028, 6, 12, Math.PI * 1.5), '#9eb0ad', 0, -.37); jaw.rotation.z = -Math.PI / 4;
  const puffs = Array.from({ length: 4 }, () => { const puff = movable(ball(boiler, '#b6ca8d', .10, .12, .1)); puff.material.transparent = true; puff.material.depthWrite = false; puff.castShadow = false; return puff; });
  box(boiler, '#9a7651', 1.2, .12, .45, .94, 1.93, -1.49);
  for (let i = 0; i < 3; i++) box(boiler, '#c2a47a', .30, .28 + i * .06, .34, .52 + i * .36, 2.13, -1.49);
  box(boiler, '#a96149', .62, .28, .36, -1.10, .18, .75); line(boiler, '#6d5c4b', [[-1.29,.33,.75],[-1.29,.46,.75],[-.91,.46,.75],[-.91,.33,.75]], .026);
  // Laundry beneath the living room: washer, folded towels, sink and a ceiling leak.
  const washer = group(laundry, 1.03, .02, -.98);
  box(washer, '#e9e3ce', 1.0, 1.12, .82, 0, .57);
  ring(washer, '#a4b8b0', .31, .06, 0, .54, .44);
  cylinder(washer, '#779caa', .26, .03, 0, .54, .45).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) box(washer, ['#bac6ac','#d8c39d','#c9ac91'][i], .71, .09, .48, 0, 1.19 + i * .09);
  for (const x of [-.28,.28]) ball(washer, '#8b9d99', .045, .045, .03, x, 1.02, .44);
  box(laundry, '#b7a484', .91, .76, .58, -.82, .41, -1.28);
  ball(laundry, '#f0e8d3', .50, .07, .35, -.82, .83, -1.28);
  line(laundry, '#8e9c97', [[-.82,.85,-1.5],[-.82,1.15,-1.5],[-.82,1.15,-1.25]], .03);
  houseWindow(laundry, .9, 2.06, -1.75, .88, .65);
  const rohil = actor(laundry, faces, 'rohil', -.66, .80);
  const bucket = group(laundry, .20, .06, .92, true); cylinder(bucket, '#6d9499', .27, .42, 0, .21, 0, .34);
  const handle = ring(bucket, '#c0b895', .28, .018, 0, .49); handle.scale.y = .7;
  line(laundry, '#80989a', [[.23,2.65,-1.75],[.23,2.65,.92],[.23,2.35,.92]], .035);
  const drop = movable(ball(laundry, '#7dbbc9', .035, .07, .035, .23, 1.6, .92));
  const bubble = speech(laundry, 'I brought the bucket.', rohil, 2.7);
  const people = [michal, rina, ohm, rohil];
  const roomLight = { value: 1 };
  const stage = make('utilities', root, people, (time, state) => {
    const t = state.still ? 1.4 : time, boost = time < state.boostUntil;
    const push = Math.sin(t * (boost ? 7 : 3.8)); plunger.position.y = .76 + push * .15;
    michal.root.rotation.x = -.04 - push * .06;
    plunger.updateWorldMatrix(true, true);
    reach(michal, michal.leftArm, plunger.localToWorld(new T.Vector3(-.035, .58, 0)));
    reach(michal, michal.rightArm, plunger.localToWorld(new T.Vector3(.035, .44, 0)));
    ohm.rightArm.rotation.x = -.85 + Math.sin(t * 2.4) * .12; ohm.rightArm.rotation.z = .38 + Math.sin(t * 1.2) * .06;
    ohm.root.rotation.z = Math.sin(t) * .04; valve.rotation.z = Math.sin(t * 1.3) * .2;
    puffs.forEach((puff, i) => { const p = (t * .45 + i / 4) % 1; puff.position.set(.10 + p * .3, 1.65 + p * .6, -.90); puff.material.opacity = (1 - p) * .4; });
    const on = state.still || Math.floor(t / .72) % 2 === 0; rocker.rotation.x = on ? -.3 : .3;
    roomLight.value = on ? 1 : 0;
    root.userData.utilities = { loungeLit: on };
    shade.material.color.set(on ? '#ffe296' : '#a79978'); pool.material.opacity = on ? .27 : 0;
    rina.leftArm.rotation.z = -.22 - Math.max(0, Math.sin(t * 4.5)) * .6; rina.root.rotation.z = Math.sin(t * 2.25) * .04;
    // Pose the body before solving the hand reach, including the first still frame.
    rocker.updateWorldMatrix(true, true); reach(rina, rina.rightArm, rocker.localToWorld(new T.Vector3(0, 0, .1 + Math.max(0, Math.sin(t * 4.5)) * .13)));
    bucket.updateWorldMatrix(true, true); reach(rohil, rohil.rightArm, bucket.localToWorld(new T.Vector3(-.24, .48, 0)));
    drop.position.y = 2.30 - (t * .8 % 1) * 1.70; bubble.visible = state.still || boost || Math.floor(t / 3) % 4 === 2;
  });
  // Apply after batching, including the original portrait. Multiplying the final
  // room shading removes all light locally, without changing any global light.
  lounge.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]) as T.Material[]) {
      material.onBeforeCompile = shader => {
        shader.uniforms.roomLight = roomLight;
        shader.fragmentShader = `uniform float roomLight;\n${shader.fragmentShader}`.replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb *= roomLight;\n#include <tonemapping_fragment>');
      };
      material.customProgramCacheKey = () => 'isolated-utility-room';
    }
  });
  return stage;
}

function movieTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 288;
  const ctx = canvas.getContext('2d')!, texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  let frame = -1;
  const paint = (time: number, variation = 0) => {
    const next = Math.floor(time * 5) + variation * 10000; if (next === frame) return; frame = next;
    const gradient = ctx.createLinearGradient(0, 0, 512, 288); gradient.addColorStop(0, variation % 2 ? '#31254d' : '#122e59'); gradient.addColorStop(1, '#6189a7'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 288);
    for (let i = 0; i < 45; i++) { ctx.fillStyle = i % 4 ? '#d9e4e2' : '#f6d6a0'; ctx.beginPath(); ctx.arc((i * 83 + time * 2) % 512, (i * 59) % 288, i % 3 ? 1 : 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#f0cbaa'; ctx.beginPath(); ctx.arc(349, 102, 55, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#29394f'; ctx.beginPath(); ctx.moveTo(0, 288); for (let i = 0; i <= 12; i++) ctx.lineTo(i * 44, 220 + Math.sin(i * 1.8) * 28); ctx.lineTo(512, 288); ctx.fill();
    ctx.fillStyle = '#bbd6de'; ctx.beginPath(); ctx.moveTo(145 + Math.sin(time * .4) * 24, 115); ctx.lineTo(175 + Math.sin(time * .4) * 24, 135); ctx.lineTo(125 + Math.sin(time * .4) * 24, 137); ctx.fill();
    texture.needsUpdate = true;
  };
  paint(0); return { texture, paint };
}
function events(faces: Faces) {
  const root = new T.Group(); roomSet(root, { dark: true });
  box(root, '#332c43', 7.8, .018, 5.9, 0, .09, .1);
  // Twelve seats on the main floor and balcony share the two-storey envelope.
  box(root, '#514252', 4.65, .20, 3.40, 1.52, 2.79, -.98);
  box(root, '#766071', 4.65, .46, .13, 1.52, 3.12, .75);
  box(root, '#b28b62', 4.69, .06, .17, 1.52, 3.38, .75);
  for (let i = 0; i < 11; i++) box(root, '#ad8a65', .055, .40, .05, -.58 + i * .41, 3.14, .83);
  for (const y of [0,2.90]) for (const z of [1.55,-.55]) {
    if (y > 0 && z > 0) continue;
    for (const x of [-.50,1.05,2.60]) chair(root, x, y > 0 ? .15 : z, '#765267', -1.20, y);
  }
  for (const x of [-.5,1.05,2.6]) chair(root, x, -1.92, '#66516c', -1.20, 3.18);
  box(root, '#514252', 4.6, .28, 1.1, 1.52, 3.03, -2.0);
  root.userData.seatCount = 12;
  for (let i = 0; i < 12; i++) box(root, '#61505c', .46, (i + 1) * .24, .23, 3.78, (i + 1) * .12, 2.80 - i * .23);
  for (const y of [1.55,4.65]) {
    framedPicture(root, 1.15, y, -2.68, true);
    for (const x of [-.1,2.6]) box(root, '#39354d', .63, 1.42, .09, x, y, -2.65);
  }
  bookcase(root, 3.05, -2.38, 1.1, true);
  const topShelf = group(root, 0, 3.18, 0); bookcase(topShelf, 3.05, -2.38, 1.0, true);
  // A wall projection faces the seating squarely. Its entire plane sits inside
  // the left wall; there is no freestanding screen cutting across the room.
  const film = movieTexture(), screenWall = group(root, -4.015, 3.60, .10, true);
  screenWall.name = 'cinema-wall-projection'; screenWall.rotation.y = Math.PI / 2;
  const screen = new T.Mesh(new T.PlaneGeometry(6.20, 3.32), new T.MeshBasicMaterial({ map: film.texture, toneMapped: false }));
  screen.name = 'cinema-picture'; screenWall.add(screen);
  for (const side of [-1,1]) for (let i = 0; i < 3; i++) cylinder(screenWall, i % 2 ? '#765066' : '#614059', .055, 5.55, side * (3.19 + i * .09), -.24, .055);
  box(screenWall, '#7c5964', 6.80, .15, .17, 0, 2.59, .045);
  // All four people remain visible; two on the main floor, two in the balcony.
  const positions = [[-.50,1.55,0],[1.05,1.55,0],[1.05,.15,2.90],[2.60,.15,2.90]];
  const people = members.map((id, i) => {
    const [x,z,y] = positions[i];
    const person = actor(root, faces, id, x, z + .02, { y: y + .35, seated: true });
    person.root.rotation.y = -1.20; person.root.userData.portraitYaw = -.24;
    person.leftArm.rotation.x = -.65; person.rightArm.rotation.x = -.65; return person;
  });
  for (const index of [1,3]) {
    const popcorn = group(people[index].root, 0, .64, .35);
    cylinder(popcorn, '#d9b599', .15, .29, 0, .15, 0, .2);
    for (let i = 0; i < 7; i++) ball(popcorn, '#eee1b2', .055, .047, .055, Math.sin(i * 2.4) * .12, .30 + i % 2 * .035, Math.cos(i * 2.4) * .12);
  }
  box(root, '#6b5660', 1.30, .10, .57, .18, .49, 2.65);
  for (const x of [-.30,.66]) box(root, '#423d49', .07, .45, .44, x, .25, 2.65);
  for (const x of [-.06,.44]) { cylinder(root, '#c9a98b', .085, .20, x, .64, 2.66); cylinder(root, '#534442', .068, .009, x, .746, 2.66); }
  plant(root, -3.5, 2.6, .02, 1.0);
  const projector = group(root, 2.59, 5.31, -1.6);
  box(projector, '#68758b', .64, .25, .43); cylinder(projector, '#91b9d1', .11, .14, -.39, 0).rotation.z = Math.PI / 2;
  cylinder(root, '#494453', .045, .80, 2.59, 5.83, -1.6);
  const beamGeometry = new T.BufferGeometry(); screenWall.updateWorldMatrix(true, true);
  const corners = [[-3.10,-1.66],[3.10,-1.66],[3.10,1.66],[-3.10,1.66]].map(([x,y]) => screenWall.localToWorld(new T.Vector3(x,y,.015)));
  const vertices: number[] = []; for (let i = 0; i < 4; i++) vertices.push(2.20,5.31,-1.6,...corners[i].toArray(),...corners[(i+1)%4].toArray());
  beamGeometry.setAttribute('position', new T.Float32BufferAttribute(vertices,3));
  const beam = new T.Mesh(beamGeometry, new T.MeshBasicMaterial({ color: '#b6cfff', transparent: true, opacity: .055, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })); root.add(beam);
  const aisleLights = new T.InstancedMesh(new T.BoxGeometry(.07,.025,.20),new T.MeshBasicMaterial({color:'#c79658'}),10);
  const lampPose = new T.Matrix4(); let lampIndex=0;
  for (const y of [.09,2.94]) for(let i=0;i<5;i++) { lampPose.makeTranslation(3.82,y,-2.4+i*.53); aisleLights.setMatrixAt(lampIndex++,lampPose); }
  root.add(aisleLights);
  const bubble = speech(root, 'Pass the popcorn.', people[1], 3.0);
  return make('events', root, people, (time,state) => {
    const t = state.still ? 2 : time; film.paint(t,state.variation);
    people.forEach((person,i) => { person.root.rotation.z = Math.sin(t*.8+i)*.025; person.rightArm.rotation.x = -.68-Math.max(0,Math.sin(t*1.3+i))*.55; });
    beam.material.opacity = .055+Math.sin(t*1.7)*.008; bubble.visible = state.still || time < state.boostUntil || Math.floor(t/4)%5===3;
  },true);
}

function bulletin(faces: Faces) {
  const root = new T.Group(); roomSet(root, { floor: '#bc9b73', wall: '#dfd3b9' });
  for (const side of [-1,1]) {
    box(root, '#a98a61', 1.92, .18, 2.03, side * 3.05, 3.08, -1.65);
    box(root, '#967650', 1.96, .10, .12, side * 3.05, 3.84, -.61);
    for (let i=0;i<6;i++) box(root, '#b7986b', .055, .68, .055, side*3.05-.83+i*.33, 3.47, -.61);
    const gallery = group(root, side * 3.05, 3.18, 0); bookcase(gallery, 0, -2.16, 1.25);
    houseWindow(root, side * 1.35, 4.58, -2.66, .90, 1.85);
    box(root, '#d4bd91', .22, 5.74, .24, side * 2.03, 3.04, -2.46);
    box(root, '#ebd9b7', .38, .15, .35, side * 2.03, 5.96, -2.46);
  }
  const upperCrest = group(root, 0, 4.42, -2.60);
  ring(upperCrest, '#b79655', .49, .04);
  line(upperCrest, '#b79655', [[0,-.35,0],[0,.35,0]], .025);
  line(upperCrest, '#b79655', [[-.34,.16,0],[.34,.16,0]], .025);
  for(const side of [-1,1]) { line(upperCrest,'#b79655',[[side*.3,.16,0],[side*.3,-.18,0]],.015); ring(upperCrest,'#b79655',.13,.018,side*.3,-.20).rotation.x=Math.PI/2; }

  for (let i = 0; i < 12; i++) box(root, i % 2 ? '#967452' : '#a17f5a', .66, 1.05, .08, -3.72 + i * .675, .57, -2.5);
  bookcase(root, -3.18, -2.16, 1.25); bookcase(root, 3.18, -2.16, 1.25);
  for (const side of [-1, 1]) {
    houseWindow(root, side * 1.86, 2.11, -2.51, .77, 1.38);
    for (let i = 0; i < 3; i++) cylinder(root, i % 2 ? '#a27b64' : '#8f6958', .065, 1.80, side * (2.32 + i * .08), 2.05, -2.32);
    box(root, '#d0b889', .20, 2.77, .22, side * 1.32, 1.55, -2.36);
    box(root, '#e8d7b4', .33, .13, .32, side * 1.32, 2.94, -2.36);
    box(root, '#95704d', 1.52, .14, .57, side * 2.75, .47, 2.56);
    box(root, '#a37d55', 1.52, .44, .12, side * 2.75, .78, 2.79);
    for (const dx of [-.55,.55]) box(root, '#806044', .09, .43, .44, side * 2.75 + dx, .23, 2.56);
  }
  // A house clock and case files make the improvised courtroom feel occupied.
  cylinder(root, '#80694c', .27, .07, -3.18, 2.59, -2.45).rotation.x = Math.PI / 2;
  cylinder(root, '#efe5c8', .23, .08, -3.18, 2.59, -2.40).rotation.x = Math.PI / 2;
  line(root, '#635c4a', [[-3.30,2.59,-2.34],[-3.18,2.59,-2.34],[-3.18,2.75,-2.34]], .012);
  box(root, '#9c7753', 3.25, .28, 1.5, 0, .16, -1.4);
  const rohil = actor(root, faces, 'rohil', 0, -1.38, { y: .56, outfit: 'judge' });
  box(root, '#76513d', 2.5, .72, .5, 0, .7, -.9); box(root, '#a87c4e', 2.7, .13, .67, 0, 1.12, -.88);
  box(root, '#bd9459', 1.0, .25, .025, 0, .77, -.637);
  const gavel = group(rohil.rightArm, 0, -.43, .03); cylinder(gavel, '#9d6b38', .028, .35, 0, -.08); cylinder(gavel, '#6e402b', .08, .27, 0, -.25).rotation.z = Math.PI / 2;
  cylinder(root, '#664630', .16, .05, .68, 1.22, -.72);
  const michal = actor(root, faces, 'michal', -2.48, .9, { outfit: 'lawyer' });
  box(root, '#8c6b4c', 1.8, .09, .82, -2.40, .85, .15); for (const x of [-3.1, -1.7]) box(root, '#806044', .08, .8, .08, x, .42, .15);
  for (let i = 0; i < 4; i++) box(root, i % 2 ? '#cbb68a' : '#e4d7b2', .47, .035, .34, -2.92 + i * .022, .93 + i * .04, .14).rotation.y = i * .06;
  cylinder(root, '#cabca0', .08, .18, -1.83, 1.0, .11);
  const papers = group(michal.leftArm, 0, -.43, .08); box(papers, '#f8f1db', .3, .40, .025); for (let i = 0; i < 4; i++) box(papers, '#9babb0', .21, .009, .005, 0, -.10 + i * .06, .016);
  const rina = actor(root, faces, 'rina', .9, 1.05), ohm = actor(root, faces, 'ohm', 2.45, 1.08);
  box(root, '#a98760', 3.2, .13, .18, 1.72, .9, 1.64);
  for (let i = 0; i < 8; i++) box(root, '#9f7d58', .075, .78, .09, .3 + i * .4, .46, 1.64);
  speech(root, 'Everyone is guilty except me.', rohil, 3.2);
  plant(root, -3.7, -1.2);
  return make('bulletin', root, [michal, rina, ohm, rohil], (time, state) => {
    const t = state.still ? 1 : time, boost = time < state.boostUntil;
    const bang = Math.pow(Math.max(0, Math.sin(t * (boost ? 5 : 2.2))), 5);
    rohil.rightArm.rotation.x = -2.1 + bang * .80; rohil.rightArm.rotation.z = .60; rohil.leftArm.rotation.x = -.6;
    michal.rightArm.rotation.z = 2.3 + Math.sin(t * 2) * .2; michal.leftArm.rotation.x = -.4;
    rina.leftArm.rotation.z = -.42; rina.rightArm.rotation.z = .42; ohm.rightArm.rotation.x = -.3;
  });
}

function broom(root: T.Object3D, x: number, z: number) {
  const g = group(root, x, .16, z, true); g.rotation.z = -.23;
  cylinder(g, '#bb945f', .028, 1.28, 0, .64); box(g, '#c6a352', .52, .15, .17);
  for (let i = 0; i < 10; i++) box(g, i % 2 ? '#debf72' : '#b79549', .025, .16, .17, -.23 + i * .05, -.04);
  return g;
}
function todos(faces: Faces) {
  const root = new T.Group(); roomSet(root); loft(root);
  houseWindow(root, -2.63, 2.12, -2.51, 1.30, 1.17);
  framedPicture(root, -.47, 2.08, -2.50);
  sofa(root, -2.71, -1.77, 2.0, '#a7b29c');
  box(root, '#be9e75', .65, .07, .62, -.92, .55, -1.75);
  cylinder(root, '#9a805a', .065, .53, -.92, .28, -1.75);
  plant(root, -.92, -1.75, .60, .60);
  // Ohm has his own raised room; the remaining floor belongs to the cleaning crew.
  box(root, '#b4b9a2', 3.0, .28, 2.9, 2.47, .18, -.95);
  box(root, '#a2b0a0', .12, 2.0, 2.5, .95, 1.27, -1.15);
  box(root, '#bdc6b2', 3, 1.9, .04, 2.47, 1.25, -2.52);
  const tv = movieTexture(), tvStand = group(root, 1.20, 1.75, -1.15, true); tvStand.name = 'ohm-wall-tv'; tvStand.rotation.y = Math.PI / 2;
  box(tvStand, '#343f49', 1.40, .96, .12);
  const panel = new T.Mesh(new T.PlaneGeometry(1.23, .77), new T.MeshBasicMaterial({ map: tv.texture, toneMapped: false })); panel.name = 'ohm-tv-picture'; panel.position.z = .075; tvStand.add(panel);
  chair(root, 2.07, -.35, '#839087', -1.2, .34);
  const ohm = actor(root, faces, 'ohm', 2.07, -.30, { y: .69, seated: true }); ohm.root.rotation.y = -1.2; ohm.root.userData.portraitYaw = -.18; ohm.rightArm.rotation.x = -.95;
  box(ohm.rightArm, '#39494d', .09, .20, .04, 0, -.44, .03);
  const michal = actor(root, faces, 'michal', -2.6, .95), rina = actor(root, faces, 'rina', -.45, 1.73), rohil = actor(root, faces, 'rohil', 2.7, 1.7);
  const brooms = [broom(root, -1.96, 1.48), broom(root, .24, 2.03)];
  const bag = group(rohil.leftArm, 0, -.58, .04); ball(bag, '#485b50', .28, .34, .25, 0, -.17); cylinder(bag, '#4c6253', .06, .11, 0, .2); const knot = ring(bag, '#425349', .055, .022, 0, .28); knot.rotation.x = Math.PI / 2;
  const bin = group(root, 3.7, 0, 2.26); cylinder(bin, '#6d8278', .31, .66, 0, .35); cylinder(bin, '#587065', .35, .07, 0, .72);
  const dust = Array.from({ length: 12 }, (_, i) => movable(ball(root, '#ad9470', .035, .016, .025, -2.6 + (i % 5) * .5, .075, 1.8 + Math.floor(i / 5) * .25)));
  plant(root, -3.75, -.20, 0, 1.1);
  box(root, '#d7bd96', .72, .59, .52, 3.54, .63, -2.1);
  for (let i = 0; i < 3; i++) box(root, ['#887565','#b4c0a6','#d5b27c'][i], .45, .07, .28, 3.54, .99 + i * .07, -2.1);
  const bubble = speech(root, 'After this episode.', ohm, 2.8);
  return make('todos', root, [michal, rina, ohm, rohil], (time, state) => {
    const t = state.still ? 1 : time, speed = time < state.boostUntil ? 2 : 1;
    [michal, rina].forEach((person, i) => {
      const sway = Math.sin(t * 2.3 * speed + i * 2); brooms[i].position.x = (i ? .24 : -1.96) + sway * .24;
      brooms[i].rotation.z = -.18 + sway * .12; brooms[i].updateWorldMatrix(true, true);
      reach(person, person.rightArm, brooms[i].localToWorld(new T.Vector3(0, .95, .02)));
      reach(person, person.leftArm, brooms[i].localToWorld(new T.Vector3(0, .75, -.02)));
      person.root.rotation.z = sway * .045;
    });
    rohil.root.position.z = 1.58 + Math.sin(t * .9) * .32; rohil.leftArm.rotation.x = Math.sin(t * 2) * .12;
    rohil.legs.forEach((leg, i) => leg.rotation.x = Math.sin(t * 3.5 + i * Math.PI) * .18);
    dust.forEach((d, i) => { d.position.x = -2.6 + (i % 5) * .52 + Math.sin(t * 1.7 + i) * .11; });
    ohm.rightArm.rotation.x = -.8 + Math.sin(t * .6) * .08; tv.paint(t, state.variation); bubble.visible = state.still || Math.floor(t / 4) % 3 === 1;
  });
}

function expenses(faces: Faces) {
  const root = new T.Group(); roomSet(root, { floor: '#c8b1a0', wall: '#e5d9cb' }); loft(root, '#ad927f');
  sofa(root, -.25, -2.02, 2.45, '#b59689');
  houseWindow(root, -.25, 2.14, -2.50, 1.4, 1.2);
  bookcase(root, -3.28, -2.15, 1.28);
  framedPicture(root, 2.79, 2.10, -2.49);
  box(root, '#ab8c68', 1.40, .66, .54, 2.80, .39, -2.12);
  for (const x of [2.43,3.17]) { box(root, '#c0a17c', .61, .49, .035, x, .40, -1.83); ball(root, '#7d6d52', .03, .03, .03, x, .42, -1.79); }
  plant(root, 3.15, -2.12, .75, .8);
  plant(root, -3.74, 1.94, 0, 1.25);
  const michal = actor(root, faces, 'michal', 0, 1.6, { y: -.24, seated: true }); michal.root.rotation.x = .43;
  const rina = actor(root, faces, 'rina', -2.15, .68), ohm = actor(root, faces, 'ohm', 2.14, .68), rohil = actor(root, faces, 'rohil', .02, -1.25);
  const people = [michal, rina, ohm, rohil];
  // Actual green bill props, with a generic dollar symbol rather than real currency artwork.
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 88; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a5c792'; ctx.fillRect(0, 0, 192, 88); ctx.strokeStyle = '#4c7b58'; ctx.lineWidth = 4; ctx.strokeRect(8, 8, 176, 72);
  ctx.fillStyle = '#608b65'; ctx.beginPath(); ctx.ellipse(96, 44, 26, 31, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e1e4bc'; ctx.font = 'bold 44px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 96, 45);
  const noteTexture = new T.CanvasTexture(canvas); noteTexture.colorSpace = T.SRGBColorSpace;
  const bills = new T.InstancedMesh(new T.PlaneGeometry(.44, .20), new T.MeshBasicMaterial({ map: noteTexture, side: T.DoubleSide, toneMapped: false }), 36); bills.instanceMatrix.setUsage(T.DynamicDrawUsage); bills.frustumCulled = false; root.add(bills);
  const dummy = new T.Object3D();
  [rina, ohm, rohil].forEach(person => { for (const arm of [person.leftArm, person.rightArm]) box(arm, '#a3c28e', .26, .12, .08, 0, -.42, .02); });
  const coin = movable(cylinder(root, '#c28a4c', .065, .025, .35, .1, 1.89));
  for (let i = 0; i < 27; i++) cylinder(root, i % 2 ? '#bd824d' : '#d0a16a', .066, .02, -.7 + (i % 7) * .20, .1 + Math.floor(i / 7) * .014, 2.0 + Math.floor(i / 7) * .12);
  for (let stack = 0; stack < 3; stack++) for (let i = 0; i < 5 + stack; i++) cylinder(root, '#bb8853', .071, .024, .8 + stack * .22, .1 + i * .027, 1.97);
  const bubble = speech(root, 'Every. Single. Penny.', michal, 2.7);
  bubble.userData.avoidCrowd = true;
  plant(root, -3.65, -1.7); plant(root, 3.65, -1.7);
  return make('expenses', root, people, (time, state) => {
    const t = state.still ? 1.8 : time, speed = time < state.boostUntil ? 1.8 : 1;
    [rina, ohm, rohil].forEach((person, i) => {
      person.leftArm.rotation.z = -2.15 + Math.sin(t * 3.6 + i) * .35;
      person.rightArm.rotation.z = 2.15 + Math.sin(t * 3.6 + i + 1) * .35;
      person.root.position.y = Math.abs(Math.sin(t * 2.4 + i)) * .07;
    });
    for (let i = 0; i < 36; i++) {
      const phase = (t * .23 * speed + i / 36) % 1, angle = i * 2.399 + t * .15;
      const radius = 1.05 + (i % 4) * .35;
      dummy.position.set(Math.cos(angle) * radius, 3.1 - phase * 2.94, .5 + Math.sin(angle) * radius);
      dummy.rotation.set(.6 + Math.sin(t * 2 + i) * .7, t * .6 + i, Math.cos(t + i) * .6); dummy.updateMatrix(); bills.setMatrixAt(i, dummy.matrix);
    }
    bills.instanceMatrix.needsUpdate = true;
    const p = (t * .52) % 1; coin.position.set(.12 + p * .72, .13 + Math.sin(p * Math.PI) * .28, 1.97);
    coin.updateWorldMatrix(true, true); reach(michal, michal.rightArm, coin.localToWorld(new T.Vector3(0, .04, 0)));
    michal.leftArm.rotation.x = -.7; bubble.visible = state.still || Math.floor(t / 4) % 3 === 0;
  });
}
export function createStage(id: StageId, faces: Faces): HouseStage {
  return ({ home, utilities, events, bulletin, todos, expenses })[id](faces);
}
