import test from 'node:test';
import assert from 'node:assert/strict';
import {newPoolGame,shootPool,stepPool,aimPool,POOL} from '../src/components/virtual-office/pool-physics.ts';
const settle=game=>{for(let i=0;i<2400&&game.moving;i++)stepPool(game,1/120);assert.equal(game.moving,false,'a shot eventually settles');};
test('pool transfers momentum and resolves actual cushion collisions',()=>{
 const g=newPoolGame(2);g.balls.forEach(b=>{if(b.id>0)b.alive=b.id===1;});
 Object.assign(g.balls.find(b=>b.id===1),{x:0,z:0});Object.assign(g.balls[0],{x:-1,z:0});
 shootPool(g,0,3);for(let i=0;i<60;i++)stepPool(g,1/120);
 assert.equal(g.firstHit,1);assert(g.balls.find(b=>b.id===1).x>.1);settle(g);
 const rail=newPoolGame();rail.balls.filter(b=>b.id>0).forEach(b=>b.alive=false);Object.assign(rail.balls[0],{x:2.45,z:.5});shootPool(rail,0,2);stepPool(rail,.1);
 assert(rail.balls[0].vx<0);assert(rail.balls[0].x<=POOL.halfX-POOL.radius);
});
test('a scratch respots the white ball and passes the turn; a legal nine-ball pot wins',()=>{
 const scratch=newPoolGame(2);Object.assign(scratch.balls[0],{x:2.44,z:1.03});shootPool(scratch,Math.PI/4,1);settle(scratch);
 assert.equal(scratch.turn,1);assert(scratch.balls[0].alive);assert(scratch.scratch);
 const win=newPoolGame(2);win.balls.filter(b=>b.id>0&&b.id!==9).forEach(b=>b.alive=false);
 const nine=win.balls.find(b=>b.id===9);Object.assign(nine,{x:2.43,z:1.07});Object.assign(win.balls[0],{x:1.95,z:.7});
 shootPool(win,Math.atan2(nine.z-.7,nine.x-1.95),1.8);settle(win);
 assert.equal(win.firstHit,9);assert.equal(win.winner,0);assert.equal(nine.alive,false);
});
test('autonomous shots keep finite physics state and cannot shoot twice during ball motion',()=>{
 const g=newPoolGame();for(let shot=0;shot<20&&g.winner===null;shot++){
  assert(shootPool(g,aimPool(g)));assert.equal(shootPool(g,0),false);settle(g);
  for(const b of g.balls)assert([b.x,b.z,b.vx,b.vz].every(Number.isFinite));
 }
 assert(g.shots>1);assert(g.balls.some(b=>b.id>0&&!b.alive),'players really pocket balls');
});
