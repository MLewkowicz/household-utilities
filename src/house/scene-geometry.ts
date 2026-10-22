import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const colors = { wall: '#f3e4cb', trim: '#fff0d7', wood: '#b9956b', tile: '#be7158', teal: '#709c95', dark: '#354a4a', brass: '#cfab62' };
export function movable<O extends T.Object3D>(object: O): O { object.userData.movable = true; return object; }
export function group(parent: T.Object3D, x = 0, y = 0, z = 0, animated = false) {
  const g = new T.Group(); g.position.set(x, y, z); parent.add(g); if (animated) movable(g); return g;
}
export function mesh(parent: T.Object3D, geometry: T.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, new T.MeshLambertMaterial({ color }));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function box(parent: T.Object3D, color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  return mesh(parent, new T.BoxGeometry(w, h, d), color, x, y, z);
}
export function ball(parent: T.Object3D, color: string, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0) {
  const m = mesh(parent, new T.SphereGeometry(1, 12, 8), color, x, y, z); m.scale.set(rx, ry, rz); return m;
}
export function cylinder(parent: T.Object3D, color: string, radius: number, height: number, x = 0, y = 0, z = 0, top = radius) {
  return mesh(parent, new T.CylinderGeometry(top, radius, height, 12), color, x, y, z);
}
export function line(parent: T.Object3D, color: string, points: number[][], radius = .025) {
  const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
  return mesh(parent, new T.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 7, false), color);
}
export function ring(parent: T.Object3D, color: string, radius: number, tube: number, x = 0, y = 0, z = 0) {
  return mesh(parent, new T.TorusGeometry(radius, tube, 8, 24), color, x, y, z);
}

/** Bake stationary subtrees into vertex-colored meshes; preserve every animated joint. */
export function batch(parent: T.Object3D) {
  [...parent.children].forEach(batch);
  for (const child of [...parent.children]) {
    if (!(child instanceof T.Group) || child.userData.movable) continue;
    child.updateMatrix();
    for (const object of [...child.children]) { object.applyMatrix4(child.matrix); parent.add(object); }
    parent.remove(child);
  }
  const batches = new Map<string, T.Mesh<T.BufferGeometry, T.MeshLambertMaterial>[]>();
  for (const child of parent.children) {
    if (!(child instanceof T.Mesh) || child.children.length || child.userData.movable || !(child.material instanceof T.MeshLambertMaterial) || child.material.transparent) continue;
    const key = `${child.castShadow}:${child.receiveShadow}`;
    const list = batches.get(key) ?? []; list.push(child); batches.set(key, list);
  }
  for (const objects of batches.values()) {
    if (objects.length < 2) continue;
    const pieces = objects.map(object => {
      object.updateMatrix();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      if (!geometry.hasAttribute('color')) {
        const rgb = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < rgb.length; i += 3) object.material.color.toArray(rgb, i);
        geometry.setAttribute('color', new T.BufferAttribute(rgb, 3));
      }
      return geometry;
    });
    const merged = mergeGeometries(pieces); pieces.forEach(p => p.dispose());
    if (!merged) continue;
    const object = new T.Mesh(merged, new T.MeshLambertMaterial({ vertexColors: true }));
    object.castShadow = objects[0].castShadow; object.receiveShadow = objects[0].receiveShadow; parent.add(object);
    objects.forEach(o => { parent.remove(o); o.geometry.dispose(); o.material.dispose(); });
  }
}

export function dispose(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
  root.traverse(object => {
    if (!(object instanceof T.Mesh) && !(object instanceof T.Sprite)) return;
    if (object instanceof T.Mesh) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  root.clear();
}
