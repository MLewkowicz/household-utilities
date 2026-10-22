import * as T from 'three';
import { actor, speech, type Faces } from './bitmoji-cast';
import { ball, box, cylinder, group, line, movable, ring } from './scene-geometry';
import { window as houseWindow } from './cottage-sets';
import type { StageState } from './stage-data';

/** Independent room builders keep downstairs experiments clear of the upper floor. */
export function ohmBedroom(room: T.Group, faces: Faces) {
  room.name = 'ohm-bedroom';
  box(room, '#b6c4be', 3.93, 1.12, .025, 0, .63, -1.78);
  // A low bed, stacked pillows and a rumpled blanket give the lounging pose a home.
  box(room, '#9a795b', 1.66, .29, 2.48, -.35, .24, -.04);
  box(room, '#e8dfcb', 1.62, .24, 2.41, -.35, .50, -.04);
  box(room, '#8c7058', 1.78, 1.03, .13, -.35, .63, -1.32);
  for (const x of [-.77,.06]) ball(room, '#f5edda', .36, .16, .37, x, .70, -.91);
  box(room, '#8ba8a9', 1.65, .18, 1.42, -.35, .66, .43);
  for (let i = 0; i < 7; i++) box(room, '#b4c5be', 1.65, .02, .055, -.35, .762, -.14 + i * .19);
  box(room, '#b4c5be', 1.66, .045, .12, -.35, .78, -.24);
  box(room, '#9a795b', 1.74, .22, .12, -.35, .38, 1.23);
  const ohm = actor(room, faces, 'ohm', -.35, .10, { y: .16, seated: true });
  ohm.root.rotation.x = -.25;
  // The blanket reaches his waist and conceals the legs completely; the bent
  // seated shoes must not protrude through the quilt as the house rotates.
  ohm.legs.forEach(leg => leg.visible = false);
  ohm.leftArm.rotation.z = -.65; ohm.leftArm.rotation.x = -.5;
  // A remote stays in the palm while he lazily adjusts the AC.
  const remote = group(ohm.rightArm, 0, -.42, .06);
  box(remote, '#4b666a', .12, .25, .055);
  box(remote, '#afd4cf', .075, .07, .012, 0, .06, .034);
  for (const y of [-.02,-.07]) ball(remote, '#e6dfc8', .018, .018, .008, 0, y, .034);
  // Two wall units plus a portable one: all running, with visible open louvers.
  const acPositions = [-.98,1.02];
  for (const x of acPositions) {
    box(room, '#f1eee0', 1.45, .48, .38, x, 1.72, -1.56);
    box(room, '#c6d3cc', 1.28, .09, .04, x, 1.54, -1.34);
    for (let i = 0; i < 8; i++) box(room, '#748f90', .10, .047, .027, x -.53 + i * .15, 1.55, -1.31);
    box(room, '#7ebfb1', .12, .035, .015, x + .50, 1.77, -1.36);
    box(room, '#d8e1d6', 1.32, .04, .23, x, 1.46, -1.27).rotation.x = -.25;
  }
  const portable = group(room, 1.32, .06, -.85);
  box(portable, '#dce5dd', .66, 1.06, .61, 0, .59);
  for (let i = 0; i < 5; i++) box(portable, '#6e9396', .48, .035, .035, 0, .72 + i * .065, .325);
  for (const x of [-.23,.23]) ball(portable, '#60777a', .08, .08, .08, x, .08, .17);
  line(portable, '#b5c5bc', [[.31,.48,-.10],[.50,.45,-.30],[.50,.35,-.77]], .12);
  // Pedestal fan: its cage stays still while its three broad blades spin inside.
  cylinder(room, '#758c88', .30, .07, 1.25, .09, .86);
  cylinder(room, '#8d9e95', .035, .91, 1.25, .56, .86);
  const fan = group(room, 1.25, 1.18, .86, true);
  for (const z of [-.05,.08]) ring(fan, '#7b938e', .40, .025, 0, 0, z);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    line(fan, '#9db1a5', [[0,0,.10],[Math.cos(angle)*.40,Math.sin(angle)*.40,.08]], .012);
  }
  const blades = group(fan, 0, 0, .01, true);
  for (let i = 0; i < 3; i++) {
    const blade = group(blades); blade.rotation.z = i * Math.PI * 2 / 3;
    ball(blade, '#a7c4c0', .105, .225, .03, .06, .16);
  }
  ball(fan, '#e0dbc4', .08, .08, .06, 0, 0, .12);
  // Small modeled ribbons drift out of each unit, rather than another particle loop.
  const breezes = acPositions.flatMap(x => Array.from({ length: 3 }, (_, i) => {
    const breeze = group(room, x -.35 + i * .35, 1.34, -1.20, true);
    const stream = line(breeze, '#badbd4', [[0,0,0],[.03,-.05,.18],[-.03,-.09,.34],[0,-.13,.47]], .016);
    stream.castShadow = false; stream.receiveShadow = false;
    return breeze;
  }));
  const fanWind = Array.from({ length: 3 }, (_, i) => {
    const breeze = group(room, 1.06 + i * .19, 1.14, 1.02, true);
    const stream = line(breeze, '#c4ddd3', [[0,0,0],[-.04,.03,.18],[.04,0,.37],[0,.04,.53]], .017);
    stream.castShadow = false; stream.receiveShadow = false;
    return breeze;
  });
  return {
    person: ohm,
    tick(t: number, state: StageState) {
      const boost = t < state.boostUntil;
      blades.rotation.z = -t * (boost ? 24 : 15);
      fan.rotation.y = -.20 + Math.sin(t * .7) * .27;
      ohm.rightArm.rotation.x = -1.2 + Math.sin(t * .8) * .07;
      ohm.rightArm.rotation.z = .35;
      breezes.forEach((breeze, i) => {
        const p = (t * .75 + i / 3) % 1;
        breeze.position.z = -1.22 + p * .48;
        breeze.scale.setScalar(.65 + Math.sin(p * Math.PI) * .35);
      });
      fanWind.forEach((breeze, i) => {
        const p = (t * 1.8 + i / 3) % 1;
        breeze.position.z = .96 + p * .34;
        breeze.scale.setScalar(.5 + Math.sin(p * Math.PI) * .5);
      });
    },
    details: () => ({ airConditioners: 3, fanAngle: blades.rotation.z, lounging: true }),
  };
}

export function rohilShower(room: T.Group, faces: Faces) {
  room.name = 'rohil-shower';
  box(room, '#b3c8c1', 3.93, 2.33, .025, 0, 1.21, -1.78);
  for (let row = 0; row < 6; row++) box(room, '#dbe4d7', 3.91, .018, .012, 0, .20 + row * .40, -1.76);
  for (let column = 0; column < 10; column++) box(room, '#dbe4d7', .018, 2.31, .012, -1.8 + column * .4, 1.21, -1.76);
  // Low open-front shower: the portrait and falling water stay readable in section.
  box(room, '#ede8d6', 1.80, .15, 1.73, -.48, .12, .33);
  box(room, '#b4d1cc', 1.58, .03, 1.48, -.48, .21, .33);
  for (const x of [-1.35,.39]) box(room, '#f8efdc', .08, .18, 1.77, x, .22, .33);
  box(room, '#f8efdc', 1.82, .18, .08, -.48, .22, 1.19);
  cylinder(room, '#6c8b8d', .09, .012, -.48, .235, .86);
  line(room, '#9aaea9', [[-.48,.88,-1.65],[-.48,2.52,-1.65],[-.48,2.52,.32]], .038);
  cylinder(room, '#9aaea9', .29, .06, -.48, 2.48, .32);
  cylinder(room, '#dee4d5', .25, .02, -.48, 2.44, .32);
  for (const x of [-.66,-.30]) {
    cylinder(room, '#e3e5d6', .095, .07, x, 1.06, -1.65).rotation.x = Math.PI / 2;
    box(room, x < -.48 ? '#87aeb1' : '#bf947d', .10, .025, .025, x, 1.06, -1.60);
  }
  // Side screen and towels add the enclosure without glass over the Bitmoji.
  box(room, '#c8dad0', .06, 1.03, 1.53, .42, .76, .31);
  box(room, '#8aa9a5', .09, .055, 1.57, .42, 1.29, .31);
  houseWindow(room, 1.27, 2.03, -1.73, .64, .65);
  line(room, '#9b987b', [[.86,1.17,-1.67],[1.66,1.17,-1.67]], .026);
  box(room, '#d0b59a', .49, .64, .065, 1.22, .89, -1.60);
  box(room, '#edd8b3', .49, .045, .075, 1.22, .65, -1.59);
  box(room, '#c6b493', .77, .08, .38, 1.23, .35, -.79);
  for (const x of [1.04,1.41]) box(room, '#b29d7c', .06, .31, .30, x, .17, -.79);
  for (let i = 0; i < 2; i++) box(room, i ? '#d8ddc4' : '#e4c79f', .62, .085, .29, 1.23, .44 + i * .09, -.79);
  for (const [x,color] of [[-.99,'#789e91'],[-.75,'#d8bb79']] as const) {
    cylinder(room, color, .07, .23, x, .37, -.18);
    cylinder(room, '#eee4ce', .034, .035, x, .51, -.18);
  }
  const rohil = actor(room, faces, 'rohil', -.48, .47, { y: .22 });
  // A wrap covers the torso and shorts; face and small gesturing arms remain visible.
  cylinder(rohil.root, '#e6dcc5', .25, .58, 0, .59, 0, .22);
  box(rohil.root, '#c4bca5', .035, .48, .024, .09, .58, .236);
  const lyrics = ['Fuck me in the shower', 'I don’t misbehave', 'I’m such a good little boy'];
  const bubbles = lyrics.map(text => speech(room, text, rohil, 2.7));
  // One instanced draw for the continuous stream; no per-frame texture uploads.
  const waterCount = 48;
  const water = movable(new T.InstancedMesh(new T.CylinderGeometry(.016,.016,1,4), new T.MeshBasicMaterial({ color: '#74bfcd', transparent: true, opacity: .8, depthWrite: false }), waterCount));
  water.name = 'continuous-shower-water'; water.frustumCulled = false;
  water.instanceMatrix.setUsage(T.DynamicDrawUsage); room.add(water);
  const drop = new T.Object3D();
  const ripples = Array.from({ length: 3 }, () => {
    const ripple = movable(ring(room, '#cce8de', .20, .011, -.48, .242, .33));
    ripple.rotation.x = -Math.PI / 2; ripple.castShadow = false; ripple.receiveShadow = false; return ripple;
  });
  const notes = Array.from({ length: 5 }, (_, i) => {
    const note = group(room, 0, 0, 0, true), color = i % 2 ? '#b79556' : '#678e85';
    ball(note, color, .073, .047, .023, -.04, 0).rotation.z = .30;
    box(note, color, .026, .24, .025, .02, .12);
    if (i % 2) {
      box(note, color, .16, .045, .025, .09, .23).rotation.z = .16;
      box(note, color, .026, .24, .025, .16, .14);
      ball(note, color, .073, .047, .023, .10, .02).rotation.z = .30;
    } else box(note, color, .12, .045, .025, .07, .21).rotation.z = -.35;
    note.traverse(object => { if (object instanceof T.Mesh) { object.castShadow = false; object.receiveShadow = false; } });
    return note;
  });
  let lyricIndex = 0;
  return {
    person: rohil,
    tick(t: number, state: StageState) {
      lyricIndex = (Math.floor(t / 4.5) + state.variation) % lyrics.length;
      bubbles.forEach((bubble, i) => bubble.visible = i === lyricIndex);
      rohil.root.rotation.z = Math.sin(t * 2.4) * .035;
      rohil.leftArm.rotation.z = -.65 + Math.sin(t * 2.4) * .18;
      rohil.rightArm.rotation.z = 1.05 + Math.sin(t * 2.4 + .6) * .22;
      rohil.rightArm.rotation.x = -.3;
      for (let i = 0; i < waterCount; i++) {
        const lane = i % 12, phase = (t * 1.35 + Math.floor(i / 12) / 4 + lane * .061) % 1;
        const angle = lane * 2.39996, radius = .17 + (lane % 3) * .075;
        const length = .15 + lane % 3 * .035;
        drop.position.set(-.48 + Math.cos(angle) * radius, 2.36 - phase * 2.03, .32 + Math.sin(angle) * radius);
        drop.scale.set(1,length,1); drop.updateMatrix(); water.setMatrixAt(i,drop.matrix);
      }
      water.instanceMatrix.needsUpdate = true;
      ripples.forEach((ripple,i) => { const p = (t * 1.2 + i / 3) % 1; ripple.scale.setScalar(.4 + p * 1.3); });
      notes.forEach((note,i) => {
        const p = (t * .32 + i / notes.length) % 1, side = i % 2 ? -1 : 1;
        note.position.set(-.48 + side * (.49 + p * .38) + Math.sin(t * 1.6 + i) * .07, .90 + p * 1.50, .65);
        note.rotation.z = Math.sin(t * 1.8 + i) * .16;
        note.scale.setScalar(Math.min(1,p * 7,(1 - p) * 7));
      });
    },
    details: () => ({ waterDrops: waterCount, waterY: water.instanceMatrix.array[13], lyric: lyrics[lyricIndex], lyricIndex, musicalNotes: notes.length }),
  };
}
