// Preserve authenticated meeting entry after login without widening role routes.
export function portalLoginDestination(role:string|undefined,requested:string|null){
 let safe:string|null=null;
 try{if(requested&&requested.length<=2048){const decoded=decodeURIComponent(requested);if(decoded.startsWith('/')&&!decoded.startsWith('//')&&!/[\\\x00-\x20]/.test(decoded)&&!decoded.startsWith('/auth/')&&!decoded.startsWith('/api/'))safe=requested;}}catch{/* Unsafe return values fall back to the role's home. */}
 const meeting=!!safe&&/^\/meetings\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe);
 if(role==='admin')return meeting||safe==='/admin'||safe?.startsWith('/admin/')?safe!:'/admin';
 if(role==='employee')return meeting||safe==='/employee'||safe?.startsWith('/employee/')?safe!:'/employee';
 return safe??'/dashboard';
}
