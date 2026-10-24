// Preserve authenticated meeting entry after login without widening role routes.
export function portalLoginDestination(role:string|undefined,requested:string|null){
 const safe=requested?.startsWith('/')&&!requested.startsWith('//')&&!requested.includes('\\')?requested:null;
 const meeting=!!safe&&/^\/meetings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe);
 if(role==='admin')return meeting||safe==='/admin'||safe?.startsWith('/admin/')?safe!:'/admin';
 if(role==='employee')return meeting||safe==='/employee'||safe?.startsWith('/employee/')?safe!:'/employee';
 return safe??'/dashboard';
}
