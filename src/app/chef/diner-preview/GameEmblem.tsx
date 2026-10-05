import type { CSSProperties } from 'react';

/** Small, original illustrated controls. The world itself remains interactive 3D. */
export function GameEmblem({kind,size=48,style}:{kind:'cook'|'decorate'|'friends'|'chef'|'coin';size?:number;style?:CSSProperties}){
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="#49362c" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" style={{flexShrink:0,...style}}>
    {kind==='cook'&&<>
      <ellipse cx="33" cy="55" rx="26" ry="4" fill="#49362c" opacity=".13" stroke="none"/>
      <path d="M7 19h33v30H7z" fill="#ef7958"/><path d="M40 29h10l8 10v10H40z" fill="#f8bc5b"/>
      <path d="M44 32h5l6 8H44z" fill="#9cd2ca"/><path d="M10 12h27l5 9H5z" fill="#fff3d5"/>
      <path d="m13 12-2 9m11-9v9m9-9 2 9" stroke="#e77958" strokeWidth="6"/>
      <path d="M5 22h37M7 43h33" stroke="#49362c"/>
      <rect x="13" y="27" width="20" height="11" rx="2" fill="#32645a"/>
      <path d="M16 38v3m14-3v3M43 45h4"/>
      <circle cx="16" cy="50" r="6" fill="#49362c"/><circle cx="49" cy="50" r="6" fill="#49362c"/>
      <circle cx="16" cy="50" r="2.5" fill="#fff2d5" stroke="none"/><circle cx="49" cy="50" r="2.5" fill="#fff2d5" stroke="none"/>
    </>}
    {kind==='decorate'&&<>
      <ellipse cx="31" cy="57" rx="23" ry="3" fill="#49362c" opacity=".13" stroke="none"/>
      <path d="M12 18q0-5 5-5h17q5 0 5 5v20H12z" fill="#79bbaa"/>
      <path d="M17 19h17v17H17z" fill="#b5deca" stroke="none"/>
      <path d="M10 37h32v8H10z" fill="#f6bb65"/><path d="m14 45-2 12m25-12 2 12" strokeWidth="4"/>
      <path d="m39 34 8-19 9 4-9 19z" fill="#f5af6d"/><path d="m47 15 2-6q2-4 6-2l3 1q4 2 2 6l-4 5z" fill="#ef7958"/>
      <path d="m39 34-2 11 10-7z" fill="#fff4db"/><path d="m38 41-1 4 4-2" fill="#49362c"/>
      <path d="m9 7 1 5m-4-2h6m33 37 1 5m-4-2h6" stroke="#edb94e"/>
    </>}
    {kind==='friends'&&<>
      <ellipse cx="31" cy="57" rx="26" ry="3" fill="#49362c" opacity=".13" stroke="none"/>
      <path d="M29 55V43q0-12 14-12t14 12v12" fill="#efac5d"/>
      <circle cx="44" cy="24" r="13" fill="#b77d53"/>
      <path d="M31 22q-2-14 13-14t13 16q-7 0-10-8-3 7-16 6" fill="#49362c"/>
      <path d="M5 55V43q0-12 14-12t14 12v12" fill="#70b3a4"/>
      <circle cx="20" cy="26" r="14" fill="#f1be94"/>
      <path d="M6 25Q2 7 20 9q15 0 14 16-9-1-13-9-5 9-15 9" fill="#825035"/>
      <path d="M14 27v1m11-1v1m14-3v1m10-1v1" strokeWidth="3"/>
      <path d="M16 33q4 4 8 0m16-1q4 3 7-1" strokeWidth="1.8"/>
      <path d="M29 6q-5-5-8 0 0 4 8 8 8-4 8-8-3-5-8 0" fill="#ef7958"/>
      <path d="M13 46v8m33-8v8"/>
    </>}
    {kind==='chef'&&<>
      <path d="M9 63V51q0-14 23-14t23 14v12" fill="#32776d"/>
      <path d="m24 42 8 8 8-8 4 21H20z" fill="#fff5df"/>
      <ellipse cx="32" cy="32" rx="18" ry="19" fill="#efbd95"/>
      <path d="M14 29v-7q0-14 18-14t18 14v7l-7-7q-11 5-19-1z" fill="#714531"/>
      <path d="M15 18Q5 13 11 6q5-5 12-1Q32-4 41 5q8-4 12 2 5 8-5 12v5H15z" fill="#fff8e9"/>
      <path d="M15 20h33M24 9v4m16-4v4" stroke="#d8c8ab"/>
      <ellipse cx="22" cy="36" rx="4" ry="2" fill="#e88972" stroke="none"/><ellipse cx="42" cy="36" rx="4" ry="2" fill="#e88972" stroke="none"/>
      <path d="M24 30v2m16-2v2" strokeWidth="3.5"/><path d="M27 39q5 5 10 0" strokeWidth="2"/>
      <circle cx="32" cy="57" r="1.6" fill="#d99052" stroke="none"/>
    </>}
    {kind==='coin'&&<>
      <ellipse cx="32" cy="34" rx="23" ry="25" fill="#d8892e"/>
      <circle cx="30" cy="29" r="23" fill="#ffcd62"/><circle cx="30" cy="29" r="17" stroke="#e5a541"/>
      <path d="m30 17 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#fff0b2" stroke="#d18a2d" strokeWidth="1.5"/>
      <path d="m15 13 4-3m23 35 3-3" stroke="#fff6ca" strokeWidth="3"/>
    </>}
  </svg>;
}
