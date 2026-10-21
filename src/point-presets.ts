export const POINT_POLICY='household-v1';
export const POINT_PRESETS=[
 {id:'trash-out',title:'Take out trash',points:0.5,icon:'trash'},
 {id:'trash-bag',title:'Replace trash bag',points:0.5,icon:'trash-bag'},
 {id:'recycling-out',title:'Take out recycling',points:0.5,icon:'recycling'},
 {id:'bins-return',title:'Return bins',points:0.5,icon:'bins'},
 {id:'bins-out',title:'Take out bins',points:0.5,icon:'bins'},
 {id:'dishwasher-start',title:'Start dishwasher',points:0.5,icon:'dishes'},
 {id:'sweep-kitchen',title:'Sweep kitchen',points:2,icon:'sweep'},
 {id:'sweep-living-room',title:'Sweep living room',points:2,icon:'sweep'},
 {id:'sweep-corridor',title:'Sweep corridor',points:1,icon:'sweep'},
 {id:'bananas',title:'Collect bananas',points:1,icon:'bananas'},
 {id:'shared-groceries',title:'Pick up shared groceries',points:2,icon:'groceries'},
 {id:'furniture-pickup',title:'Pick up furniture',points:3,icon:'furniture'},
 {id:'shared-repair',title:'Repair a commonly used household item',points:3,icon:'tools'},
] as const;
export const pointPreset=(id?:string|null)=>POINT_PRESETS.find(p=>p.id===id);
export const presetOptions=(selected?:string|null)=>`<option value="">Custom effort</option>${POINT_PRESETS.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${p.title} · ${p.points} pt${p.points===1?'':'s'}</option>`).join('')}`;
