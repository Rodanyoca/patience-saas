export function isoDate(value:string|null|undefined,label='Date'):string|null {
 if(!value)return null
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error(label+' invalide.')
 const date=new Date(value+'T00:00:00Z')
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error(label+' impossible.')
 return value
}
