export const GAMES = [
 {id:'geography',title:'Geography',icon:'◎',color:'#558ba3',description:'Explore the globe.'},
 {id:'odd-one-out',title:'Odd One Out',icon:'◇',color:'#c37c68',description:'Find the item that breaks the connection.'},
 {id:'passport-puzzle',title:'Passport Puzzle',icon:'✈',color:'#c3a262',description:'Identify the country from its outline and clues.'},
 {id:'clue-cascade',title:'Common Ground',icon:'▦',color:'#87a68b',description:'Sort sixteen words into four connected groups. Four mistakes allowed.'},
 {id:'before-or-after',title:'Before or After?',icon:'↔',color:'#b89a77',description:'Drag five event cards into order, from earliest to latest.'},
 {id:'how-much-ish',title:'How Much-ish?',icon:'⤢',color:'#79a99e',description:'Resize the target against the reference.'},
] as const;
export type GameId=typeof GAMES[number]['id'];
export type TriviaId=Exclude<GameId,'geography'>;
