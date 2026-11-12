import library from './size-art.json';
// Legacy profiles are retained only for attempts pinned to old question packs.
type Profile={art:string;axis:string;source:string;author:string;license:string;bounds:{width:number;height:number}};
export const sizeProfiles:Record<string,Profile>=library;
const escape=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
export function silhouetteCredit(shape:string){const p=shape.startsWith('sourced:')?sizeProfiles[shape.slice(8)]:undefined;return p?`<a href="${escape(p.source)}" target="_blank" rel="noopener noreferrer">${escape(p.author)} · ${escape(p.license)}</a>`:'';}
const paths:Record<string,string>={
 finger:'M35 100V18Q35 0 50 0Q65 0 65 18V100Z',
 hand:'M25 100V66L8 43Q4 33 12 30L31 48V10Q31 0 39 0Q47 0 47 10V40H51V12Q51 4 58 4Q65 4 65 12V43H69V22Q69 15 76 15Q83 15 83 22V60L74 100Z',
 arm:'M30 100V53L40 11 36 5 43 0 59 2 66 13 57 60 66 100Z',
 head:'M30 100V82Q13 64 15 37Q16 0 50 0Q84 0 85 37Q87 64 70 82V100Z',
 tablet:'M17 0H83V100H17Z',
 human:'M44 100V64H40V41L35 65H29L33 33Q35 27 43 26H57Q65 27 67 33L71 65H65L60 41V64H56V100H50L49 67 48 100ZM50 0A10 10 0 1 1 49.9 20A10 10 0 0 1 50 0Z',
 whale:'M0 82Q7 60 35 62Q65 64 83 80L94 73 100 75 94 84 100 94 93 93 84 87Q61 98 38 93L28 100 25 96 31 90Q9 94 0 82Z',
 shark:'M0 82Q18 70 40 74L51 58 55 76 83 81 100 66 94 83 100 98 83 87 63 89 58 100 49 88Q15 90 0 82Z',
 giraffe:'M30 100 31 63 36 55 41 17 46 9 47 0 49 0 50 9 58 11 65 17 64 22 52 22 50 59 67 67 72 94 76 100H69L62 75 58 100H53L53 73 41 68 37 100Z M31 65 25 77 23 75 26 61Z',
 elephant:'M5 75Q3 54 26 52L53 54Q58 42 76 45L89 57 94 73 100 87 95 91 83 80 79 63 76 85 72 100H64L62 77 45 80 40 100H31L30 77 18 78 14 100H6L8 73Z M5 61 0 80 2 81 9 66Z',
 ostrich:'M31 100 35 70Q14 68 13 55Q15 39 38 43L56 49 61 14 70 7 72 0 82 3 88 10 76 14 69 56Q64 69 49 70L61 96 69 98 68 100H55L42 74 40 97 46 98 46 100Z',
 trex:'M0 66 19 63 36 54 50 45 58 26 75 18 94 21 100 32 95 40 77 39 69 45 63 61 52 73 57 93 69 96 69 100H50L43 81 35 95 41 98 40 100H23L29 81 31 67 19 73Z M63 53 75 62 73 67 68 62 58 59Z',
 stegosaurus:'M0 80 20 74 25 61 33 69 38 52 47 65 55 46 63 65 72 53 77 70 89 77 100 81 98 89 84 88 80 100H73L71 86 48 87 43 100H35L35 85 17 84 0 88Z',
 plane:'M0 76 8 70 43 69 33 43 41 43 63 69 85 72 91 62 96 63 94 75 100 80 88 84 61 85 41 100 33 100 43 84 8 83Z',
 rocket:'M42 100V91L33 94 35 78 41 72V25L46 7 50 0 54 7 59 25V72L65 78 67 94 58 91V100H53L50 94 47 100Z',
 shuttle:'M0 83 17 76 40 74 40 45 49 45 61 74 88 77 93 66 97 68 96 80 100 84 92 90 61 91 49 100 40 100 40 91 13 91Z',
 ship:'M0 85H100L86 100H15Z M13 82V65H84V82Z M28 65V50H35V65M44 65V50H51V65M60 65V50H67V65M76 65V50H83V65M9 85V60H11V85Z',
 car:'M0 85 8 79 19 78 29 60H67L83 78 95 80 100 86V93H89A9 9 0 0 1 71 93H28A9 9 0 0 1 10 93H0Z',
 bus:'M0 58Q0 52 7 52H92Q100 52 100 61V94H90A8 8 0 0 1 74 94H26A8 8 0 0 1 10 94H0Z',
 phone:'M29 0H71Q76 0 76 6V94Q76 100 71 100H29Q24 100 24 94V6Q24 0 29 0Z',
 pencil:'M0 96 9 92H92L100 96 92 100H9Z',
 card:'M4 37H96Q100 37 100 41V96Q100 100 96 100H4Q0 100 0 96V41Q0 37 4 37Z',
 tower:'M48 0H52L56 48 70 80 92 100H67L60 79H40L33 100H8L30 80 44 48Z',
 clocktower:'M34 100V30H30V25H35L40 10 47 8 50 0 53 8 60 10 65 25H70V30H66V100Z',
 arch:'M5 100C9 22 30 0 50 0C70 0 91 22 95 100H86C82 30 66 12 50 12C34 12 18 30 14 100Z',
 pyramid:'M0 100 50 0 100 100Z',
 statue:'M36 100 38 48 24 30 19 9 15 6 16 0 25 0 26 6 23 10 32 27 46 34 43 24 39 20 43 17 42 12 47 15 51 9 53 15 58 12 57 18 61 21 57 24 57 35 65 43 75 41 79 60 66 63 72 100Z',
 'statue-base':'M26 100V79H40L39 49 27 32 23 10 19 6 20 0 28 0 29 7 26 11 34 29 46 35 43 24 48 20 53 22 55 34 63 42 73 41 76 57 65 60 68 79H75V100Z',
 door:'M24 0H76V100H24Z',
 };
export function sizeSilhouette(shape:string){
 const p=shape.startsWith('sourced:')?sizeProfiles[shape.slice(8)]:undefined;
 if(p){const left=50-p.bounds.width/2-6;return `<svg viewBox="0 0 100 100" data-profile="${escape(shape.slice(8))}" data-axis="${p.axis}" aria-hidden="true" preserveAspectRatio="xMidYMax meet"><g class="profile-shape" fill="currentColor">${p.art}</g><path class="size-dimension" d="${p.axis==='height'?`M${left} 0V100M${left-3} 0h6M${left-3} 100h6`:'M0 108H100M0 105v6M100 105v6'}" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;}
 return `<svg viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="xMidYMax meet">${shape==='sphere'||shape==='ball'?'<circle cx="50" cy="50" r="50" fill="currentColor"/>':`<path d="${paths[shape]||paths.tower}" fill="currentColor"/>`}</svg>`;}
