/** One order for the shortcuts, house gestures and route mapping. */
export const HOUSE_SECTIONS = [
  {route:'home',scene:'home',label:'Home'},
  {route:'chores',scene:'todos',label:'To-dos'},
  {route:'miscellaneous',scene:'expenses',label:'Expenses'},
  {route:'events',scene:'events',label:'Events'},
  {route:'bulletin',scene:'bulletin',label:'Bulletin'},
  {route:'utilities',scene:'utilities',label:'Utilities'},
] as const;
export type Section = typeof HOUSE_SECTIONS[number]['route'];
export type Feature = Exclude<Section,'home'>;
export type Scene = typeof HOUSE_SECTIONS[number]['scene'];
export const sceneFor = (route:Section) => HOUSE_SECTIONS.find(s=>s.route===route)!.scene;
export const routeFor = (scene:Scene) => HOUSE_SECTIONS.find(s=>s.scene===scene)!.route;
export function sectionFromHash(hash:string):Section {
  const key=hash.replace(/^#/,'').split('/')[0];
  return HOUSE_SECTIONS.find(s=>s.route===key)?.route ?? 'home';
}
