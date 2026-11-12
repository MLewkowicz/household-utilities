/** Stable country colors keep the revealed trail legible against the paper sphere. */
export function routeTileColor(id:string,destination?:string){
 if(id===destination)return '#dfba70';
 const palette=['#94c8b7','#e5a99b','#d5a0bf','#91bdd2','#b1a4d8','#b8c68e'];
 return palette[Array.from(id).reduce((n,c)=>n*31+c.charCodeAt(0),0)%palette.length];
}
