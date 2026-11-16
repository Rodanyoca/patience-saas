import Decimal from 'decimal.js-light'
export { Decimal }
export function decimal(value: string | number) {
 const raw=String(value).trim().replace(',', '.')
 if(!/^-?\d+(?:\.\d+)?$/.test(raw))throw new Error('Montant invalide.')
 const result=new Decimal(raw)
 if(result.abs().greaterThan('999999999999.99'))throw new Error('Montant trop élevé.')
 return result
}
export function moneyField(fd: FormData,key:string,positive=false){
 const value=decimal(String(fd.get(key)??'0'))
 if(value.lessThan(0)||(positive&&value.lessThanOrEqualTo(0)))throw new Error('Montant invalide.')
 return value.toDecimalPlaces(2,Decimal.ROUND_HALF_UP)
}
export const fixedMoney=(value:Decimal|string|number)=>new Decimal(value).toFixed(2,Decimal.ROUND_HALF_UP)
