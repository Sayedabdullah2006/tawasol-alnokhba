import assert from 'node:assert/strict';
/** Legacy suites are local-only: a production flag must never bypass quiet mode. */
export function assertWorkforceTestTarget(base){
 const url=new URL(base);
 assert(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','Unexpected test URL');
 assert(['localhost','127.0.0.1'].includes(url.hostname),'Legacy workforce suites are local-only. Production tests must use a manager-issued quiet test run.');
}
/** Explicit API clients send this header on EVERY request in a quiet production run. */
export function quietWorkforceTestHeaders(run){
 assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(run||''),'A manager-issued quiet test run is required');
 return {'x-workforce-test-run':run};
}
