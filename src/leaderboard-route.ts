import {GAMES,type GameId} from './game-registry';
export function leaderboardFocus(hash:string):GameId|''|null{
 const [,page,game]=hash.split('/');
 if(!hash.startsWith('#games/'))return null;
 if(page==='leaderboards')return GAMES.some(g=>g.id===game)?game as GameId:'';
 if(page==='scores')return 'geography';
 if(game==='scores'&&GAMES.some(g=>g.id===page))return page as GameId;
 return null;
}
