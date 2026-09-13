/** Recorded event precision: 1e-6 mm for positions, 1e-6 for other scalars.
 * Quantization happens before events are exposed and hashed. Live simulation
 * state and canonical build statistics retain their original precision. */
export function canonicalRecordedV7<T>(value:T):T {
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error('A recorded remaster event contains a non-finite number.');
    return (Number.isInteger(value)?value:Math.round(value*1e6)/1e6) as T;
  }
  if(Array.isArray(value))return value.map(item=>canonicalRecordedV7(item)) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,item])=>item!==undefined).map(([key,item])=>[key,canonicalRecordedV7(item)])) as T;
  return value;
}
