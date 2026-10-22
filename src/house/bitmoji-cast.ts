import * as T from 'three';
import { avatarUrl, characterColors, type Character } from './data';
import { ball, box, cylinder, group, movable } from './scene-geometry';
import { members } from './stage-data';

export type Faces = Record<Character, T.Texture>;
export async function loadBitmojis(): Promise<Faces> {
  const loader = new T.TextureLoader();
  return Object.fromEntries(await Promise.all(members.map(async member => {
    const texture = await loader.loadAsync(avatarUrl(member)); texture.colorSpace = T.SRGBColorSpace;
    return [member, texture];
  }))) as Faces;
}
export interface CastMember {
  id: Character; root: T.Group; head: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  leftArm: T.Group; rightArm: T.Group; legs: T.Group[]; knees: T.Group[];
}
const skin = { michal: '#deb18c', rina: '#d9ac90', ohm: '#b68566', rohil: '#ba8c6c' };
export function actor(parent: T.Object3D, faces: Faces, id: Character, x: number, z: number, options: { y?: number; scale?: number; outfit?: 'judge' | 'lawyer'; seated?: boolean } = {}): CastMember {
  const root = group(parent, x, options.y ?? 0, z, true); root.name = id; root.userData.actor = id;
  root.scale.setScalar(options.scale ?? 1);
  const shirt = options.outfit === 'judge' ? '#25242c' : options.outfit === 'lawyer' ? '#34485d' : characterColors[id];
  cylinder(root, shirt, options.outfit === 'judge' ? .29 : .23, options.outfit === 'judge' ? .78 : .46, 0, options.outfit === 'judge' ? .53 : .68, 0, .18);
  ball(root, shirt, .21, .12, .16, 0, .87);
  if (options.outfit) {
    box(root, '#f0eadc', .16, .25, .025, 0, .79, .18);
    if (options.outfit === 'lawyer') { const tie = box(root, '#b47854', .045, .21, .03, 0, .77, .2); tie.rotation.z = .06; }
  }
  const arms = [-1, 1].map(side => {
    const arm = group(root, side * .215, .87, 0, true); arm.rotation.z = side * .1;
    cylinder(arm, shirt, .075, .24, 0, -.11);
    cylinder(arm, skin[id], .055, .15, 0, -.29);
    ball(arm, skin[id], .072, .08, .065, 0, -.40); return arm;
  });
  const knees: T.Group[] = [];
  const legs = [-1, 1].map(side => {
    const leg = group(root, side * .105, .45, 0, true);
    cylinder(leg, '#3a4751', .083, .20, 0, -.1);
    const knee = group(leg, 0, -.21, 0, true); knees.push(knee);
    cylinder(knee, '#3a4751', .075, .20, 0, -.1);
    ball(knee, '#28343e', .095, .06, .14, 0, -.2, .05);
    if (options.seated) { leg.rotation.x = -Math.PI / 2; knee.rotation.x = Math.PI / 2; }
    return leg;
  });
  // The original portrait sits directly on the rounded shirt shoulders.
  // No separate neck peg or second modeled head is needed.
  const geometry = new T.PlaneGeometry(.86, .86); geometry.translate(0, .43, 0);
  const head = movable(new T.Mesh(geometry, new T.MeshBasicMaterial({ map: faces[id], transparent: true, alphaTest: .06, depthWrite: true, toneMapped: false })));
  head.position.set(0, .90, .08); head.name = `${id}-approved-bitmoji`; root.add(head);
  return { id, root, head, leftArm: arms[0], rightArm: arms[1], legs, knees };
}
const inverse = new T.Quaternion();
const chin = new T.Vector3(), towardCamera = new T.Vector3(), scale = new T.Vector3();
export function faceCamera(people: CastMember[], camera: T.Camera, tint = '#ffffff') {
  camera.getWorldDirection(towardCamera).negate();
  people.forEach(person => {
    person.root.updateWorldMatrix(true, false); person.root.getWorldQuaternion(inverse).invert();
    // The chin follows the shoulders, then moves in front of their camera-facing
    // surface. This remains correct when a body leans or the entire house turns.
    person.root.getWorldScale(scale);
    chin.set(0, .90, 0); person.root.localToWorld(chin);
    chin.addScaledVector(towardCamera, .24 * scale.y);
    person.head.position.copy(person.root.worldToLocal(chin));
    person.head.quaternion.copy(inverse).multiply(camera.quaternion);
    if (person.root.userData.portraitYaw) person.head.rotateY(person.root.userData.portraitYaw);
    person.head.material.color.set(tint);
  });
}
export function reach(person: CastMember, arm: T.Group, world: T.Vector3) {
  person.root.updateWorldMatrix(true, true);
  const direction = person.root.worldToLocal(world.clone()).sub(arm.position);
  arm.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), direction.clone().normalize());
  arm.scale.y = direction.length() / .4;
}
export function speech(parent: T.Object3D, message: string, speaker: CastMember, width = 2.8) {
  const canvas = document.createElement('canvas'); canvas.width = 512;
  const ctx = canvas.getContext('2d')!, fontSize = 52;
  ctx.font = `600 ${fontSize}px sans-serif`;
  const lines: string[] = []; let line = '';
  for (const word of message.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > 448) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  canvas.height = lines.length * 62 + 70;
  ctx.fillStyle = '#fff8e7';
  ctx.beginPath(); ctx.roundRect(4, 4, 504, canvas.height - 31, 25); ctx.fill();
  ctx.beginPath(); ctx.moveTo(224, canvas.height - 32); ctx.lineTo(256, canvas.height - 3); ctx.lineTo(282, canvas.height - 32); ctx.fill();
  ctx.fillStyle = '#35434a'; ctx.font = `600 ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((line,i) => ctx.fillText(line, 256, 34 + 31 + i * 62));
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const bubble = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  bubble.userData = { message, speaker: speaker.id, baseWidth: width, fontRatio: fontSize / canvas.width, aspect: canvas.height / canvas.width };
  bubble.center.set(.5,0); bubble.scale.set(width, width * canvas.height / canvas.width, 1); bubble.renderOrder = 10; parent.add(bubble); return bubble;
}

const speechAnchor = new T.Vector3(), cameraUp = new T.Vector3(), cameraRight = new T.Vector3();
const otherTop = new T.Vector3(), otherBottom = new T.Vector3(), otherScale = new T.Vector3();
export function placeSpeech(root: T.Group, people: CastMember[], camera: T.OrthographicCamera, viewportHeight: number, opacity = 1) {
  const unitsPerPixel = (camera.top-camera.bottom) / viewportHeight;
  cameraUp.set(0,1,0).applyQuaternion(camera.quaternion);
  cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);
  root.updateWorldMatrix(true,true);
  root.traverse(object => {
    if (!(object instanceof T.Sprite) || !object.userData.message) return;
    const speaker = people.find(person => person.id === object.userData.speaker); if (!speaker) return;
    const { baseWidth, fontRatio, aspect } = object.userData;
    const naturalFont = baseWidth * fontRatio / unitsPerPixel;
    const width = baseWidth * T.MathUtils.clamp(naturalFont,12,17) / naturalFont;
    object.scale.set(width, width * aspect, 1); object.material.opacity = opacity;
    // Captions overlay the settled view; the player fades them away during turns.
    // Anchor the tail to the portrait in screen space without a sideways offset.
    speechAnchor.set(0,.86,0); speaker.head.localToWorld(speechAnchor);
    speechAnchor.addScaledVector(cameraUp,8*unitsPerPixel);
    // A front-row speaker's caption must also clear the faces behind them.
    // Lift vertically only, preserving the tail's horizontal link to its speaker.
    for (let pass=0; object.userData.avoidCrowd && pass<people.length; pass++) {
      let lifted=false;
      for (const other of people) {
        if (other===speaker || !other.root.visible) continue;
        otherTop.set(0,.86,0); other.head.localToWorld(otherTop);
        otherBottom.set(0,0,0); other.head.localToWorld(otherBottom);
        other.head.getWorldScale(otherScale);
        const dx=Math.abs(otherTop.dot(cameraRight)-speechAnchor.dot(cameraRight));
        const top=otherTop.dot(cameraUp), bottom=otherBottom.dot(cameraUp), tail=speechAnchor.dot(cameraUp);
        if (dx<width/2+.43*otherScale.x && top>tail && bottom<tail+width*aspect) {
          speechAnchor.addScaledVector(cameraUp,top-tail+8*unitsPerPixel); lifted=true;
        }
      }
      if (!lifted) break;
    }
    object.position.copy(object.parent!.worldToLocal(speechAnchor));
  });
}
