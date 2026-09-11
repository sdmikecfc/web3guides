/** Deterministic, JSON-only utilities. These checksums are not authentication. */
export type Vec3 = [number, number, number];
/** Quaternion component order matches glTF/Three.js: x, y, z, w. */
export type QuatV6 = [number,number,number,number];
export const dotV6=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const crossV6=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const inverseQuatV6=(q:QuatV6):QuatV6=>[-q[0],-q[1],-q[2],q[3]];
export function multiplyQuatV6(a:QuatV6,b:QuatV6):QuatV6{return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
export function rotateQuatV6(v:Vec3,q:QuatV6):Vec3 {const t=scale(crossV6([q[0],q[1],q[2]],v),2);return add(v,add(scale(t,q[3]),crossV6([q[0],q[1],q[2]],t)));}
export function axisQuatV6(axis:Vec3,radians:number):QuatV6 {const n=scale(normalize(axis),Math.sin(radians/2));return [...n,Math.cos(radians/2)];}
export function fromVectorsQuatV6(from:Vec3,to:Vec3):QuatV6 {const a=normalize(from),b=normalize(to),d=dotV6(a,b);if(d<-.999999){const axis=Math.abs(a[0])<.8?crossV6(a,[1,0,0]):crossV6(a,[0,1,0]);return axisQuatV6(axis,Math.PI);}const c=crossV6(a,b),q:QuatV6=[...c,1+d],length=Math.hypot(...q);return q.map(v=>v/length) as QuatV6;}
/** Authored XYZ rotations use the same successive X, Y, Z convention as mount transforms. */
export function eulerQuatV6(rotation:Vec3):QuatV6{return multiplyQuatV6(axisQuatV6([0,0,1],rotation[2]/1000),multiplyQuatV6(axisQuatV6([0,1,0],rotation[1]/1000),axisQuatV6([1,0,0],rotation[0]/1000)));}
export function slerpQuatV6(a:QuatV6,b:QuatV6,t:number):QuatV6 {let d=a.reduce((n,v,i)=>n+v*b[i],0),end=b;if(d<0){end=b.map(v=>-v) as QuatV6;d=-d;}if(d>.9995){const q=a.map((v,i)=>v+(end[i]-v)*t) as QuatV6,n=Math.hypot(...q);return q.map(v=>v/n) as QuatV6;}const theta=Math.acos(clamp(d,-1,1)),den=Math.sin(theta),x=Math.sin((1-t)*theta)/den,y=Math.sin(t*theta)/den;return a.map((v,i)=>v*x+end[i]*y) as QuatV6;}
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const rounded = (value: number) => Math.round(value * 1e6) / 1e6;
export function angle(value: number): number { while (value > Math.PI) value -= Math.PI * 2; while (value < -Math.PI) value += Math.PI * 2; return value; }
export const length3 = (p: Vec3) => Math.hypot(...p);
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const scale = (p: Vec3, factor: number): Vec3 => [p[0]*factor,p[1]*factor,p[2]*factor];
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export function normalize(p: Vec3): Vec3 { const n=length3(p);return n>1e-9?scale(p,1/n):[0,0,1]; }
export function rotateY(p: Vec3, yaw: number): Vec3 { const c=Math.cos(yaw/1000),s=Math.sin(yaw/1000);return [p[0]*c+p[2]*s,p[1],p[2]*c-p[0]*s]; }
export function worldPoint(p:Vec3,root:{x:number;z:number;yaw:number}):Vec3 { const v=rotateY(p,root.yaw);return [v[0]+root.x,v[1],v[2]+root.z]; }
export function localPoint(p:Vec3,root:{x:number;z:number;yaw:number}):Vec3{return rotateY([p[0]-root.x,p[1],p[2]-root.z],-root.yaw);}
export function canonical(value:unknown):unknown { return Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical((value as Record<string,unknown>)[k])])):value; }
export function hashV6(value:unknown):string {let hash=2166136261;for(const char of JSON.stringify(canonical(value)))hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16).padStart(8,"0");}
export function cloneV6<T>(value:T):T{return JSON.parse(JSON.stringify(value)) as T;}
export function deepFreeze<T>(value:T):T {if(value&&typeof value==="object"&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(deepFreeze);}return value;}
export function randomV6(state:{random:number},limit=1000000):number {let x=state.random;x^=x<<13;x^=x>>>17;x^=x<<5;state.random=x>>>0;return state.random%limit;}
