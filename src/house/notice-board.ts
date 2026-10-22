import * as T from 'three';
import { batch, box, group, mesh, movable } from './scene-geometry';

/** Painted planks and lettering, lit like the rest of the lawn. */
function paintedFace() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 384;
  const g = canvas.getContext('2d')!, planks = ['#b58a5e', '#ab8056', '#b88f63'];
  planks.forEach((color, i) => { g.fillStyle = color; g.fillRect(0, i * 128, 640, 128); g.fillStyle = '#7f5c3c'; g.fillRect(0, i * 128, 640, 5); });
  g.strokeStyle = '#9a714b'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const y = 20 + i * 41; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(200, y - 6, 420, y + 8, 640, y - 2); g.stroke(); }
  g.fillStyle = '#fbf6ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#5e432b88'; g.shadowOffsetY = 3;
  g.font = '700 116px Georgia, "Times New Roman", serif'; g.fillText('What’s new', 320, 140, 560);
  g.font = '700 62px Georgia, "Times New Roman", serif'; g.fillText('Tap to see the latest', 320, 282, 560);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/** A small "What's new" board on posts, on the stationary lawn in front of the house. */
export function createNoticeBoard(scene: T.Scene) {
  const root = group(scene); root.name = 'updates-notice-board'; root.rotation.y = Math.atan2(6, 24.9);
  const stand = group(root), sign = group(stand, 0, 0, 0, true);
  for (const side of [-1, 1]) {
    box(stand, '#7d5c40', .13, 1.5, .13, side * .86, .75, -.1);
    const cap = mesh(stand, new T.ConeGeometry(.11, .14, 4), '#6f5038', side * .86, 1.57, -.1); cap.rotation.y = Math.PI / 4;
  }
  box(sign, '#8a6544', 1.92, 1.16, .07, 0, 1.03, 0);
  const face = movable(mesh(sign, new T.PlaneGeometry(1.8, 1.04), '#ffffff', 0, 1.03, .037)); face.material.map = paintedFace(); face.castShadow = false;
  box(sign, '#6f5038', 2.04, .08, .16, 0, 1.64, .02);
  for (const y of [.43, 1.63]) box(sign, '#7d5c40', 1.94, .06, .1, 0, y, .02);
  batch(stand); // Posts and frame merge into two draws; the painted face keeps its texture.
  const materials: T.MeshLambertMaterial[] = [];
  root.traverse(object => { if (object instanceof T.Mesh) materials.push(object.material); });
  let state: 'shown' | 'leaving' | 'hidden' = 'shown', leftAt = 0, clock = 0;
  const place = (camera: T.OrthographicCamera) => {
    // Wide views have spare lawn beside the house; tall phones have it below.
    const tall = T.MathUtils.smoothstep(camera.top - camera.bottom, 15, 24);
    stand.position.set(T.MathUtils.lerp(6.5, 2.2, tall), -.365, T.MathUtils.lerp(5.4, 19, tall));
    stand.rotation.y = T.MathUtils.lerp(-.14, -.1, tall); stand.scale.setScalar(T.MathUtils.lerp(1.2, 1.6, tall));
  };
  function tick(time: number, camera: T.OrthographicCamera) {
    clock = time; place(camera);
    if (state !== 'leaving') return;
    // Lean back and settle into the grass while fading, rather than popping out.
    const p = T.MathUtils.smoothstep(time - leftAt, 0, .65);
    stand.position.y -= .35 * p; sign.rotation.x = -.5 * p;
    materials.forEach(material => { material.opacity = 1 - p; });
    if (p >= 1) { state = 'hidden'; root.visible = false; }
  }
  return {
    root, tick,
    dismiss(animate: boolean) {
      if (state !== 'shown') return;
      if (!animate) { state = 'hidden'; root.visible = false; return; }
      state = 'leaving'; leftAt = clock;
      materials.forEach(material => { material.transparent = true; material.depthWrite = false; material.needsUpdate = true; });
    },
    center: () => sign.localToWorld(new T.Vector3(0, 1.03, 0)),
    hits: (ray: T.Raycaster) => state === 'shown' && ray.intersectObject(root, true).length > 0,
    diagnostics: () => ({ visible: root.visible && state !== 'hidden', state, position: stand.getWorldPosition(new T.Vector3()).toArray() }),
  };
}
