import {test} from 'node:test';
import assert from 'node:assert/strict';
import {householdDaylight} from '../src/daylight';
test('New York daylight blends through dawn and dusk and follows DST',()=>{
 const winter=(time:string)=>householdDaylight(new Date('2026-11-02T'+time+'-05:00'));
 assert.equal(winter('05:59').night,1);assert.equal(winter('07:00').night,.5);assert.equal(winter('12:00').night,0);assert.equal(winter('18:00').night,.5);assert.equal(winter('19:01').night,1);
 assert.equal(householdDaylight(new Date('2026-07-01T11:00:00Z')).hour,7);assert.equal(householdDaylight(new Date('2026-11-02T12:00:00Z')).hour,7);
});

test('dawn and dusk use distinct, readable twilight colors',async()=>{
 const {daylightPalette}=await import('../src/daylight');
 const luminance=(hex:string)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 assert.notEqual(daylightPalette(7,.5).colors?.bg,daylightPalette(18,.5).colors?.bg);
 for(const hour of [6.5,7.5,18]){const palette=daylightPalette(hour,.5).colors!;for(const foreground of [palette.ink,palette.body,palette.muted])for(const background of [palette.bg,palette.paper]){const [a,b]=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);assert.ok((a+.05)/(b+.05)>=4.5,`${hour}: ${foreground} on ${background}`);}}
});
