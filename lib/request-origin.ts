export function sameRequestOrigin(req:Pick<Request,'url'|'headers'>,configuredUrl?:string){
 const origin=req.headers.get('origin'),host=req.headers.get('host')
 if(!origin)return false
 const url=new URL(req.url)
 if(origin===url.origin)return true
 if(host&&origin===url.protocol+'//'+host)return true
 if(configuredUrl&&host){try{const configured=new URL(configuredUrl);return configured.host===host&&configured.origin===origin}catch{return false}}
 return false
}
