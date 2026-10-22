// Local-only interactive preview backed by the same SQL migration as the integration tests.
import http from 'node:http';
import {createWorkDB,ids,command,snapshot,clock,at} from '../tests/helpers/work-session-db.mjs';
import {summarizeAttendance} from '../src/lib/workforce/attendance-summary.ts';
let db=await createWorkDB(),minute=540;
const time=()=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):31\d\d$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin||'http://localhost:3113');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
  const url=new URL(req.url,'http://localhost');const actor=url.searchParams.get('employee')==='monwa'?ids.monwa:ids.noor;
  const read=async()=>{const data=await snapshot(db,actor);const periods=(await db.query('select * from wf_attendance_sessions where employee_id=$1',[actor===ids.noor?ids.en:ids.em])).rows;return {...data,summary:summarizeAttendance({periods,startDate:actor===ids.noor?'2026-10-18':'2026-10-20',month:'2026-10',now:new Date(at(time()))})};};
  if(req.method==='POST'){
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('الطلب كبير');}const body=JSON.parse(raw);
   if(url.pathname==='/advance'){
    const amount=Math.min(480,Math.max(0,Number(body.minutes)||0));
    for(let n=0;n<amount;n++) {minute++;await clock(db,time());if(body.connected){const d=await snapshot(db,actor);if(d.session)await command(db,{command:'heartbeat',session_id:d.session.id},actor);}}
   }else if(url.pathname==='/reset'){await db.close();db=await createWorkDB();minute=540;}
   else await command(db,body,actor);
  }
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await read()));
 }catch(e){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message}));}
});
server.listen(3122,'127.0.0.1',()=>console.log('Isolated work-session preview: http://127.0.0.1:3122 — no mail or production connection'));
process.on('SIGINT',async()=>{server.close();await db.close();process.exit(0);});
