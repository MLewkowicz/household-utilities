/** Saved IDs are stable: changing a label must never rewrite a reaction. */
export const NOTE_REACTIONS=[
 ['crying-laughing','Crying laughing'],['confused','Confused'],['mogging','Mogging'],
 ['vomit','Vomit'],['gentle-laughing','Gentle laughing'],['disappointed','Disappointed'],
 ['shocked','Shocked'],['gasp','Gasp'],['eye-roll','Eye roll'],['sobbing','Sobbing'],
 ['rage','Rage'],['heart-eyes','Heart eyes'],['smug','Smug'],['facepalm','Facepalm'],
] as const;
export type NoteExpression=typeof NOTE_REACTIONS[number][0];
export const expressionLabel=(expression:string)=>NOTE_REACTIONS.find(([id])=>id===expression)?.[1]||expression;
