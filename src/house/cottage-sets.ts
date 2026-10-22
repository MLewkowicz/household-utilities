import * as T from 'three';
import { ball, batch, box, cylinder, group, mesh, line } from './scene-geometry';

const ivory = '#f3ead7', trim = '#db9b62';
function tileSlope(parent: T.Object3D, width: number, depth: number, x: number, y: number, z: number, angle: number) {
  const roof = group(parent, x, y, z); roof.rotation.x = angle;
  box(roof, '#985439', width, .10, depth);
  // Broad, shallow barrel tiles: a few facets and quiet clay variations, rather
  // than noisy texture. The staggered joints survive an orthographic overview.
  const tileWidth = .53, rowDepth = depth / 9;
  const clay = ['#bc6948', '#c3704b', '#ca7851', '#bd6846', '#c7744e'];
  for (let row = 0; row < 9; row++) {
    for (let column = -1; column < Math.ceil(width / tileWidth); column++) {
      const left = Math.max(-width / 2, -width / 2 + (column + (row % 2) * .5) * tileWidth);
      const right = Math.min(width / 2, -width / 2 + (column + 1 + (row % 2) * .5) * tileWidth);
      const w = right - left - .012; if (w <= .02) continue;
      const profile = new T.Shape();
      profile.moveTo(-w / 2, 0); profile.lineTo(-w / 2, .035);
      profile.lineTo(-w * .30, .083); profile.lineTo(0, .102);
      profile.lineTo(w * .30, .083); profile.lineTo(w / 2, .035); profile.lineTo(w / 2, 0); profile.closePath();
      const tile = mesh(roof, new T.ExtrudeGeometry(profile, { depth: rowDepth + .018, bevelEnabled: false }), clay[(row * 3 + column + 6) % clay.length], (left + right) / 2, .064, -depth / 2 + row * rowDepth);
      tile.rotation.x = -.035;
    }
  }
  for (const side of [-1, 1]) box(roof, trim, .11, .18, depth + .13, side * width / 2, .02);
  box(roof, '#d3945f', width + .17, .14, .12, 0, .035, depth / 2);
}
export function window(parent: T.Object3D, x: number, y: number, z: number, width = .8, height = 1.1) {
  box(parent, '#a4bdc1', width, height, .05, x, y, z);
  for (const side of [-1, 1]) {
    box(parent, '#fff7e5', .065, height + .15, .12, x + side * (width / 2 + .03), y, z + .025);
    box(parent, '#fff7e5', width + .16, .065, .12, x, y + side * (height / 2 + .03), z + .025);
  }
  box(parent, '#fff7e5', .045, height, .1, x, y, z + .04); box(parent, '#fff7e5', width, .04, .1, x, y + .08, z + .04);
  box(parent, '#d8cbb2', width + .26, .07, .22, x, y - height / 2 - .12, z + .04);
}
export function plant(parent: T.Object3D, x: number, z: number, y = 0, size = 1) {
  const pot = group(parent, x, y, z); pot.scale.setScalar(size);
  cylinder(pot, '#b77a51', .19, .3, 0, .15, 0, .23);
  for (let i = 0; i < 5; i++) { const leaf = ball(pot, i % 2 ? '#71945e' : '#95ad74', .075, .27, .06, Math.sin(i * 1.26) * .13, .5, Math.cos(i * 1.26) * .13); leaf.rotation.z = Math.sin(i * 1.26) * -.6; }
}
// Every scene lives inside this same envelope. The shell is owned by the player,
// never replaced with an interior: its roof, gables and foundation really turn.
export const HOUSE = { width: 8.4, depth: 7.6, eave: 6.2, ridge: 7.55, upper: 3.08 } as const;
export function houseShell() {
  const root = new T.Group(); root.name = 'persistent-house-shell';
  box(root, '#afba87', 9.35, .18, 8.85, 0, -.27);
  box(root, '#d7c7a7', 8.65, .25, 7.85, 0, -.08);
  box(root, '#bcae8e', 8.75, .08, 7.95, 0, -.17);
  for (const side of [-1, 1]) {
    box(root, ivory, .20, 6.20, 7.60, side * 4.15, 3.10);
    box(root, '#b5af97', .23, .34, 7.65, side * 4.15, .20);
    box(root, '#e3d5b5', .25, .16, 7.65, side * 4.15, 3.08);
    for (const z of [-3.75, 3.75]) {
      box(root, '#e2d4b6', .25, 6.20, .23, side * 4.15, 3.1, z);
      box(root, '#f8eed8', .32, .17, .33, side * 4.15, 6.14, z);
    }
    const face = group(root, side * 4.27, 0, 0); face.rotation.y = side * Math.PI / 2;
    for (const y of [1.65, 4.63]) for (const x of [-1.74, 1.74]) {
      window(face, x, y, 0, .95, 1.28);
      box(face, '#dfa132', 1.15, .15, .32, x, y + .78, .04);
    }
    const triangle = new T.Shape(); triangle.moveTo(-3.80, 0); triangle.lineTo(0, 1.35); triangle.lineTo(3.80, 0); triangle.closePath();
    const end = mesh(root, new T.ExtrudeGeometry(triangle, { depth: .16, bevelEnabled: false }), ivory, side * 4.08, 6.20); end.rotation.y = Math.PI / 2;
    window(face, 0, 6.61, .01, .44, .49);
  }
  const slope = Math.atan2(1.35, 4.05), length = Math.hypot(1.35, 4.05);
  for (const side of [-1, 1]) tileSlope(root, 8.95, length, 0, 6.875, side * 2.025, side * slope);
  for (let i = 0; i < 17; i++) {
    const cap = mesh(root, new T.CylinderGeometry(.145, .145, .526, 8), i % 3 ? '#c77c50' : '#d18a59', -4.23 + i * .529, 7.64);
    cap.rotation.z = Math.PI / 2;
  }
  const chimney = group(root, 2.57, 0, -.75);
  box(chimney, '#decbb0', .64, 1.62, .70, 0, 7.40);
  box(chimney, '#9f9480', .80, .08, .88, 0, 7.31).rotation.x = -slope;
  for (let row = 0; row < 4; row++) {
    const y = 7.56 + row * .17;
    for (const side of [-1,1]) {
      for (let column = 0; column < 2; column++) {
        box(chimney, row % 2 ? '#bc8d70' : '#c59c7c', .29, .125, .024, -.158 + column * .316, y, side * .358);
        box(chimney, row % 2 ? '#c59c7c' : '#bc8d70', .024, .125, .32, side * .328, y, -.175 + column * .35);
      }
    }
  }
  box(chimney, '#d5b791', .84, .11, .90, 0, 8.23);
  box(chimney, '#e7ccaa', .92, .07, .98, 0, 8.31);
  for (const x of [-.20,.20]) {
    mesh(chimney, new T.CylinderGeometry(.14, .17, .32, 10, 1, true), '#b97450', x, 8.49);
    const hole = mesh(chimney, new T.CircleGeometry(.123, 10), '#473c36', x, 8.49); hole.rotation.x = -Math.PI / 2;
    const lip = mesh(chimney, new T.TorusGeometry(.14, .028, 5, 10), '#ce9165', x, 8.65); lip.rotation.x = -Math.PI / 2;
  }
  batch(root); return root;
}

export function cottageExterior(parent: T.Object3D) {
  // A recessed porch keeps every arrival inside the common footprint.
  box(parent, ivory, 8.1, 5.88, .18, 0, 3.10, -2.65);
  for (const side of [-1, 1]) {
    box(parent, ivory, 3.40, 5.88, .18, side * 2.35, 3.10, 1.78);
    box(parent, '#b9b6a4', 3.42, .42, .22, side * 2.36, .31, 1.80);
    box(parent, '#d4c9af', .10, 2.17, .28, side * .65, 1.48, 1.83);
    window(parent, side * 2.60, 1.67, 1.94, 1.02, 1.18);
    window(parent, side * 2.60, 4.55, 1.94, 1.02, 1.32);
    box(parent, '#e8a129', 1.25, .23, .36, side * 2.60, 2.46, 2.02);
    box(parent, '#e8a129', 1.25, .23, .36, side * 2.60, 5.40, 2.02);
    box(parent, '#f4ead6', .28, 2.18, .3, side * .93, 1.98, 2.02);
    box(parent, '#c5bda7', .52, .66, .6, side * .93, .59, 2.02);
    box(parent, '#faf0de', .5, .12, .53, side * .93, .94, 2.02);
  }
  box(parent, ivory, 1.30, 3.58, .18, 0, 4.25, 1.78);
  box(parent, '#dfd3ba', 8.15, .15, .27, 0, 3.10, 1.85);
  box(parent, '#dfd3ba', 1.49, .13, .29, 0, 2.50, 1.85);
  window(parent, 0, 4.55, 1.94, .88, 1.32);
  box(parent, '#544d42', 1.35, .16, 4.35, 0, .32, -.25);
  box(parent, '#302d29', 1.45, 2.3, .12, 0, 1.48, -2.35);
  for (const side of [-1, 1]) box(parent, '#655c4c', .12, 2.25, 4.1, side * .72, 1.5, -.28);
  const door = group(parent, -.62, .4, 1.88, true); door.name = 'front-door';
  box(door, '#955632', 1.24, 2.03, .08, .62, 1.015);
  for (let i = 0; i < 6; i++) box(door, '#76412c', .018, 1.83, .013, .12 + i * .20, 1.01, .047);
  ball(door, '#d8bc65', .035, .045, .04, 1.08, .93, .08);
  for (let i = 0; i < 3; i++) box(parent, '#b2b7b1', 1.95, .13 * (3 - i), .34, 0, .065 * (3 - i), 2.25 + i * .32);
  box(parent, '#c3c6bb', 1.9, .025, 1.1, 0, .025, 3.22);
  plant(parent, -3.45, 2.6, .02, 1.1); plant(parent, 3.45, 2.6, .02, 1.1);
  return door;
}
export function roomSet(parent: T.Object3D, options: { dark?: boolean; floor?: string; wall?: string; width?: number } = {}) {
  const dark = options.dark, width = 8.08;
  box(parent, options.floor ?? (dark ? '#303044' : '#d9bf93'), width, .10, 6.28, 0, .025, .10);
  box(parent, options.wall ?? (dark ? '#272a46' : '#f0e5d1'), width, 6.07, .18, 0, 3.09, -2.82);
  box(parent, dark ? '#4a4051' : '#bdaa89', width, .13, .15, 0, .15, -2.68);
  const wood = dark ? '#514858' : '#a88c65';
  for (const y of [3.08,6.05]) {
    box(parent, wood, width, .16, .24, 0, y, -2.61);
    box(parent, dark ? '#51445a' : '#f7ebd4', width, .08, .15, 0, y -.18, -2.65);
  }
  for (const x of [-3.9,-1.65,1.65,3.9]) box(parent, wood, .12, 6.05, .16, x, 3.10, -2.62);
  if (!dark) for (let i = 0; i < 13; i++) box(parent, '#c6aa82', width -.12, .007, .012, 0, .080, -2.35 + i * .43);
}
export function utilityHouse(parent: T.Object3D) {
  roomSet(parent);
  const rooms = [group(parent,-2,3.08,0,true),group(parent,2,3.08,0,true),group(parent,-2,.08,0,true),group(parent,2,.08,0,true)];
  ['bathroom','sitting-room','ohm-bedroom','rohil-shower'].forEach((name,i) => rooms[i].name = name);
  for (const y of [0,3]) {
    if (y) box(parent, '#b69a76', 8.08, .20, 4.6, 0, y -.07, -.57);
    box(parent, '#ebe0c6', .16, 2.83, 1.15, 0, y + 1.5, -1.38);
    box(parent, '#b99e75', .18, .17, 3.65, 0, y + 2.9, -.1);
    box(parent, '#a88b62', 8.08, .19, .16, 0, y -.055, 1.73);
    for (let i = 0; i < 16; i++) box(parent, '#d9bf93', .16, .13, .19, -3.83 + i * .51, y -.055, 1.76);
  }
  rooms.forEach((room,i) => {
    // Interior surfaces belong to each room, so one light switch cannot dim its
    // neighbours or the shared exterior shell.
    box(room, '#d9c49d', 3.98, .07, 3.5, 0, -.035, -.1);
    box(room, ivory, 3.99, 2.83, .16, 0, 1.42, -1.88);
    box(room, '#bca786', 3.98, .12, .12, 0, .08, -1.73);
    for (let plank = 0; plank < 7; plank++) box(room, '#c8b18a', 3.92, .007, .015, 0, .003, -1.55 + plank * .48);
    if (i === 1) {
      box(room, ivory, .09, 2.83, 3.5, 1.98, 1.42, -.1);
      box(room, '#e7dbc0', 3.97, .08, 3.5, 0, 2.84, -.1);
      box(room, '#ebe0c6', .08, 2.83, 1.15, -1.88, 1.42, -1.38);
    }
  });
  // The stair is inside the footprint, in the open well in front of the rooms.
  for (let i = 0; i < 12; i++) box(parent, '#cbb18d', .55, (i + 1) * .25, .23, -3.67, (i + 1) * .125, 2.90 - i * .23);
  line(parent, '#9e825c', [[-3.96,.8,3.02],[-3.96,3.75,.25]], .035);
  for (let i = 0; i < 6; i++) cylinder(parent, '#9e825c', .025, .8, -3.96, .65 + i * .5, 2.9 - i * .46);
  plant(parent, 3.56, 2.6, .03, .9);
  return rooms;
}
export function loft(parent: T.Object3D, color = '#b79a77') {
  box(parent, color, 7.90, .18, 1.88, 0, 3.03, -1.75);
  box(parent, '#947850', 7.90, .10, .10, 0, 3.69, -.78);
  for (let i = 0; i < 22; i++) box(parent, '#b8a07a', .045, .60, .045, -3.78 + i * .36, 3.38, -.78);
  const upper = group(parent, 0, 3.12, 0);
  bookcase(upper, -2.85, -2.36, 1.3); sofa(upper, .1, -2.04, 2.0, '#9cab95');
  plant(upper, 2.8, -1.85, .05, 1.1);
  window(upper, .05, 1.84, -2.67, 1.25, 1.0);
}

export function bookcase(parent: T.Object3D, x: number, z: number, width = 1.3, dark = false) {
  const g = group(parent, x, 0, z), wood = dark ? '#564651' : '#936b46';
  box(g, wood, width, 2.1, .15, 0, 1.05, -.15);
  for (const side of [-1, 1]) box(g, wood, .10, 2.1, .46, side * width / 2, 1.05);
  for (let row = 0; row < 4; row++) {
    box(g, wood, width + .13, .075, .48, 0, .12 + row * .64);
    if (row === 3) continue;
    for (let i = 0; i < 7; i++) {
      const height = .29 + (i % 3) * .05;
      box(g, ['#8b5550','#74847a','#b19a69','#53677a'][i % 4], width / 9, height, .27, -width * .41 + i * width * .13, .17 + row * .64 + height / 2, .02);
      box(g, '#d0b98d', width / 11, .02, .01, -width * .41 + i * width * .13, .30 + row * .64, .161);
    }
  }
}
export function sofa(parent: T.Object3D, x: number, z: number, width = 2, color = '#98aa8e') {
  const g = group(parent, x, 0, z);
  box(g, '#715f4e', width, .15, .75, 0, .22);
  box(g, color, width, .48, .22, 0, .72, -.31);
  for (const side of [-1, 1]) {
    box(g, color, width / 2 - .07, .19, .66, side * width / 4, .45, .05);
    box(g, color, .2, .53, .85, side * width / 2, .49);
    box(g, '#cfc1a0', .31, .29, .13, side * width * .32, .69, -.13).rotation.z = side * .15;
  }
}
export function framedPicture(parent: T.Object3D, x: number, y: number, z: number, dark = false) {
  box(parent, dark ? '#736378' : '#997c55', .80, 1.04, .07, x, y, z);
  box(parent, dark ? '#354863' : '#b7c2a9', .66, .88, .02, x, y, z + .045);
  ball(parent, dark ? '#b9a58a' : '#e5c580', .16, .16, .01, x + .10, y + .19, z + .06);
  box(parent, dark ? '#546273' : '#829b80', .66, .25, .02, x, y -.25, z + .065);
}
export function chair(parent: T.Object3D, x: number, z: number, color = '#8a5760', angle = 0, y = 0) {
  const g = group(parent, x, y, z); g.rotation.y = angle;
  box(g, '#282a35', .7, .2, .65, 0, .42);
  box(g, color, .74, .18, .66, 0, .67);
  box(g, color, .73, .94, .17, 0, 1.04, -.35);
  for (const side of [-1, 1]) { box(g, color, .15, .19, .76, side * .43, .88); cylinder(g, '#3c3941', .05, .45, side * .25, .24); }
  return g;
}
