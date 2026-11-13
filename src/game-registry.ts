export const GAMES = [
 {id:'geography',title:'Geography',icon:'◎',color:'#558ba3',description:'Explore the globe.'},
 {id:'odd-one-out',title:'Odd One Out',icon:'◇',color:'#c37c68',description:'Find the item that breaks the connection.'},
 {id:'passport-puzzle',title:'Passport Puzzle',icon:'✈',color:'#c3a262',description:'Identify the country from its outline and clues.'},
 {id:'clue-cascade',title:'Common Ground',icon:'▦',color:'#87a68b',description:'Sort sixteen words into four connected groups. Four mistakes allowed.'},
 {id:'before-or-after',title:'Before or After?',icon:'↔',color:'#b89a77',description:'Drag five event cards into order, from earliest to latest.'},
 {id:'how-much-ish',title:'How Much-ish?',icon:'⤢',color:'#79a99e',description:'Move the silhouettes, resize the target, and check its real scale. Practice Classic, Pop culture, or Geography; Daily mixes all three.'},
 {id:'sudoku',title:'Sudoku',icon:'9',color:'#9b8ab3',description:'Fill each row, column and 3 × 3 box with the digits 1–9. Use pencil notes for possibilities.'},
 {id:'crossword',title:'Crossword',icon:'▦',color:'#b69072',description:'Solve the mini crossword. Tap a square twice to change direction; arrow keys move between squares.'},
] as const;
export type GameId=typeof GAMES[number]['id'];
export type TriviaId=Exclude<GameId,'geography'>;
