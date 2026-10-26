// Deliberately local: PGlite only; no Supabase client, credentials or email transport.
import http from 'node:http';
import {currentWeeklyPreview,illustrativeWeeklyPreview} from './weekly-hours-preview-data.mjs';
const current=await currentWeeklyPreview(),example=await illustrativeWeeklyPreview();
await current.db.close();await example.db.close();
const server=http.createServer((req,res)=>{
 const origin=req.headers.origin;if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1):31\d\d$/.test(origin)){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin??'http://localhost:3113');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.writeHead(405).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({current:current.result,example:example.result}));
});
server.listen(3126,'127.0.0.1',()=>console.log('Weekly hours preview on http://127.0.0.1:3126 — isolated, no notifications/mail'));
process.on('SIGINT',()=>{server.close();process.exit(0)});
