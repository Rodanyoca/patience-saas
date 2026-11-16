import Link from 'next/link'
export function Pagination({path,params,page,hasNext}:{path:string;params:Record<string,string|undefined>;page:number;hasNext:boolean}){
 const href=(n:number)=>{const query=new URLSearchParams();for(const [k,v]of Object.entries(params))if(v&&k!=='page')query.set(k,v);query.set('page',String(n));return path+'?'+query}
 return <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-sm"><span>Page {page}</span><div className="flex gap-4">{page>1&&<Link href={href(page-1)}>Précédente</Link>}{hasNext&&<Link href={href(page+1)}>Suivante</Link>}</div></nav>
}
