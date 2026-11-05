// Never derive public auth redirects from the internal Railway listener, Host,
// or forwarded headers. The public service origin is a fixed deployment contract.
export const AUTH_ORIGIN='https://nukhba.media'
export function publicAuthUrl(path:string):URL {
 if(!path.startsWith('/')||path.startsWith('//')||/[\\\x00-\x20]/.test(path))throw Error('INVALID_AUTH_PATH')
 const url=new URL(path,AUTH_ORIGIN)
 if(url.origin!==AUTH_ORIGIN)throw Error('INVALID_AUTH_PATH')
 return url
}
