import assert from 'node:assert/strict';
/** Production mutation tests require both an explicit flag and the verified company origin. */
export function assertWorkforceTestTarget(base){
 const url=new URL(base);
 assert(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Unexpected test URL');
 const local=['localhost','127.0.0.1'].includes(url.hostname);
 const production=process.env.WORKFORCE_ALLOW_PRODUCTION_TESTS==='1'&&url.origin==='https://nukhba.media';
 assert(local||production,'Production QA must be explicitly enabled for https://nukhba.media');
}
