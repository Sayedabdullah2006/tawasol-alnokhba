const wageCents=(value:string)=>{if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(value))throw Error('الأجر غير صحيح');const [whole,part='']=value.split('.');return BigInt(whole)*BigInt(100)+BigInt(part.padEnd(2,'0'));};
/** One rounding to cents after multiplying source monthly wages by exact seconds. */
export function overtimeAmount(actual:string,basic:string,seconds:number){
 if(!Number.isSafeInteger(seconds)||seconds<=0||seconds>86400)throw Error('فترة خارج الدوام غير صحيحة');
 const denominator=BigInt(1728000),numerator=(wageCents(actual)*BigInt(2)+wageCents(basic))*BigInt(seconds);
 const cents=(numerator+denominator/BigInt(2))/denominator;
 return `${cents/BigInt(100)}.${String(cents%BigInt(100)).padStart(2,'0')}`;
}
