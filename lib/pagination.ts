export const PAGE_SIZE=50
export function pageNumber(value?:string){const n=Number(value??1);return Number.isSafeInteger(n)&&n>=1&&n<=100000?n:1}
