import type { ReactNode } from 'react';

const cream='#fff4db',gold='#f4bd5f',green='#83b978',leaf='#4e805c',red='#e87959',ink='#78503c';
const art:Record<string,ReactNode>={
  beef:<>
    <path d="M12 24c4-9 15-14 23-10 6 2 7 8 14 12 10 7 7 20-3 24-8 4-13-3-21-1-13 3-22-13-13-25Z" fill="#bf645e"/>
    <path d="M13 25c4-8 14-12 21-9 6 2 7 8 13 12 8 5 5 15-2 18-7 3-13-3-21-1-10 2-17-11-11-20Z" fill="#f4c1a7"/>
    <path d="M17 26c4-6 12-8 17-5 4 2 6 7 11 11 5 4 3 9-2 10-6 2-11-3-18-1-8 1-12-9-8-15Z" fill="#d77972" stroke="none"/>
    <path d="m21 24 3 7-3 7m10-14 1 5 7 6" stroke="#f5bbac" strokeWidth="2.7"/>
    <ellipse cx="32" cy="33" rx="5" ry="6" transform="rotate(-25 32 33)" fill={cream}/><ellipse cx="32" cy="33" rx="1.6" ry="2.2" fill="#d8a47f" stroke="none"/>
  </>,
  bun:<>
    <path d="M9 34h46v8c-1 7-8 11-23 11S10 49 9 42Z" fill="#d99548"/>
    <path d="M8 33c0-16 10-24 24-24s24 8 24 24c-7 6-41 6-48 0Z" fill={gold}/>
    <path d="M16 23c3-6 7-8 13-9" stroke="#ffe0a0" strokeWidth="4"/>
    <path d="m23 22 2 2m9-7-1 3m9 4 2-2m-11 8 2 1m-20 1 2-1m30-1 1 2" stroke={cream} strokeWidth="2.8"/>
    <path d="M12 41c10 4 30 4 40 0" stroke="#fbdba0"/>
  </>,
  potato:<>
    <path d="M28 18c5-11 18-12 23-5 6 8 8 20 1 27-7 8-15 3-20-1-9-8-8-14-4-21Z" fill="#bf925f"/>
    <path d="M12 26c6-7 13-9 21-5 8 3 15 11 12 20-2 11-11 15-23 12-12-3-20-17-10-27Z" fill="#d6ac70"/>
    <path d="M15 31c3-5 7-6 11-6" stroke="#f3d2a0" strokeWidth="3.5"/>
    <path d="m20 41 2 1m10-12 1 2m3 12-2 1m8-25 2 1m3 10 1 2" stroke="#9d784d" strokeWidth="2.5"/>
  </>,
  cheese:<>
    <path d="m9 30 30-17 17 12v23L10 52Z" fill="#e7a340"/>
    <path d="m9 30 30-17 17 12-33 15Z" fill="#ffe091"/>
    <path d="m9 30 14 10 33-15v23L10 52Z" fill="#f7c45e"/>
    <path d="m15 34 9 4 23-10" stroke="#fff0bf" strokeWidth="2.5"/>
    <ellipse cx="35" cy="24" rx="4" ry="2.1" fill="#e3a247" stroke="none"/>
    <circle cx="34" cy="41" r="4" fill="#d9963e" stroke="none"/><circle cx="48" cy="36" r="3" fill="#d9963e" stroke="none"/><circle cx="19" cy="46" r="2" fill="#d9963e" stroke="none"/>
  </>,
  lettuce:<>
    <path d="M16 43C5 43 3 31 11 27 5 18 15 10 23 14 28 3 40 7 43 16 53 10 62 22 55 31c7 9-2 18-13 16l-9 8Z" fill="#79ad65"/>
    <path d="M16 28c-2-9 9-14 15-7 5-9 17-5 16 5 12 2 10 15 1 18-6 10-23 13-33 1-7-4-6-13 1-17Z" fill="#a8ce87"/>
    <path d="M18 38c0-9 10-14 14-5 6-8 17-4 15 5-1 9-10 14-15 16-7-3-14-9-14-16Z" fill="#bedb9f"/>
    <path d="M32 51V35m0 10-8-7m8 6 8-9M13 25l7 4m25-6-5 5" stroke="#679657"/>
  </>,
  tomato:<>
    <path d="M32 19c-16-10-27 2-25 16 2 13 13 20 25 19 13 1 24-6 25-19 2-14-10-26-25-16Z" fill={red}/>
    <path d="M33 50c11-1 18-6 20-14" stroke="#cf604a" strokeWidth="4"/>
    <path d="M14 29c1-5 5-7 8-7" stroke="#ffc5a0" strokeWidth="4"/>
    <path d="m32 22-13 2 7-7-6-5 12 3 7-7v10l10 4-12 2-5 7Z" fill={leaf}/>
    <path d="M32 17c0-5 3-9 7-10" stroke={leaf} strokeWidth="3.5"/>
  </>,
  onion:<>
    <path d="m29 10-4-5m6 7 1-8m2 8 6-6" stroke="#9b8160"/>
    <path d="M27 12h9c0 9 6 11 12 16 18 19 0 29-16 28-17 1-34-10-16-28 6-6 11-9 11-16Z" fill="#d1a184"/>
    <path d="M29 15c-1 12-17 21-9 32m13-31c2 12 17 22 9 33" stroke="#f1d1ae" strokeWidth="3"/>
    <path d="M32 19c-7 12-8 23 0 33 8-11 7-23 0-33Z" fill="#f1cfab" stroke="#b5816b"/>
    <path d="m28 56-2 3m6-3v4m4-4 2 3" strokeWidth="1.7"/>
  </>,
  egg:<>
    <path d="M38 34c0 13-7 21-17 21S5 47 5 37 12 12 21 12s17 13 17 22Z" fill="#f1d7b7"/>
    <path d="M13 32c0-6 3-12 6-14" stroke="#fff5df" strokeWidth="3.7"/>
    <path d="M33 25c4-3 11 1 14 6 8 1 13 7 10 15-2 8-12 11-20 9-13 2-19-11-12-18 1-7 3-11 8-12Z" fill="#fff8e6"/>
    <circle cx="40" cy="41" r="9" fill="#f4b744"/><path d="M35 39c1-3 3-4 5-4" stroke="#ffe49c" strokeWidth="3"/>
  </>,
  milk:<>
    <path d="m16 18 7-9h21l5 10v35H16Z" fill="#9fcfc8"/>
    <path d="m16 18 7-9 8 9v36H16Z" fill="#e5f0db"/>
    <path d="M31 18h18v36H31Z" fill="#fff6df"/>
    <path d="M23 9h21v6H28Z" fill="#82b8b2"/>
    <path d="M17 26h13v8H17Z" fill="#7dafaa" stroke="none"/>
    <path d="M40 28s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z" fill="#8fc7bf"/>
    <path d="M36 42q2 2 5 1" stroke="#d5e9d7"/>
  </>,
  flour:<>
    <path d="m18 12 5-4h21l3 5-4 10c7 8 11 18 10 28-10 6-31 6-41 0-1-11 2-20 10-28Z" fill="#e7c39b"/>
    <path d="M18 14h29l-4 9H22Z" fill="#fff2d6"/>
    <path d="m22 21 21 1" stroke="#bd966d"/>
    <rect x="19" y="28" width="28" height="20" rx="7" fill="#fff2d6" stroke="none"/>
    <path d="M33 44V31m0 6-7-5m7 10-7-5m7 0 7-5m-7 10 7-5" stroke="#bf8e50" strokeWidth="2.5"/>
    <path d="m17 43-1 5m31-20 2 6" stroke="#f7ddba" strokeWidth="3"/>
  </>,
  sugar:<>
    <path d="M17 16h28v5l5 6v24c-9 6-28 6-37 0V27l4-6Z" fill="#dbe8d6"/>
    <path d="M14 33h35v18c-9 5-26 5-35 0Z" fill="#fff4df" stroke="none"/>
    <rect x="15" y="10" width="32" height="9" rx="3" fill="#d99489"/>
    <path d="M20 13h22" stroke="#edbab0"/>
    <path d="m23 31 9-4 10 4v12l-10 4-9-4Z" fill="#fffaf0"/>
    <path d="m23 31 9 4 10-4m-10 4v12" stroke="#d8c8ad"/>
    <path d="m46 47 8-3 6 5v8l-9 3-6-5Z" fill="#fff8e8"/><path d="m46 47 6 5 8-3m-8 3-1 8" stroke="#d8c8ad"/>
  </>,
  cooking_oil:<>
    <path d="M26 12h13v12c0 4 8 7 8 13v15c-6 5-22 5-28 0V37c0-6 7-9 7-13Z" fill="#e7eacb"/>
    <path d="M20 36h26v15c-6 4-20 4-26 0Z" fill="#efc65b" stroke="none"/>
    <rect x="25" y="7" width="15" height="9" rx="3" fill={leaf}/><path d="M28 10h9" stroke="#a2c589"/>
    <rect x="22" y="36" width="21" height="13" rx="4" fill="#fff3cd" stroke="none"/>
    <path d="M31 46c-4-8 4-9 7-8 0 6-3 9-7 8Z" fill={leaf} stroke="none"/>
    <path d="m23 30-1 3m0 5v6" stroke="#fff8db" strokeWidth="2.8"/>
  </>,
  bacon:<>
    <path d="m12 9 13 4c-3 8 3 9 0 18s-7 10-7 22L6 49c-1-10 4-14 6-20 3-8-2-12 0-20Z" fill="#d77566"/>
    <path d="M18 13c-1 8 3 9 0 18-3 7-6 11-6 18" stroke="#ffd4aa" strokeWidth="4"/>
    <path d="m39 9 14 5c-5 8 2 13-2 21s-7 10-6 22l-14-5c-1-10 4-14 6-21 4-8-2-14 2-22Z" fill="#ce6e5e"/>
    <path d="M45 14c-3 8 3 12-1 20-4 7-7 11-6 17" stroke="#ffd4aa" strokeWidth="4.5"/>
    <path d="m25 21 6 2m-6 8 6 2" stroke="#edba93" strokeWidth="1.8"/>
  </>,
  chicken:<>
    <path d="m40 37 10 9c7-3 12 5 6 8 0 8-10 8-11 1l-11-9Z" fill="#fff3d8"/>
    <path d="M13 15c10-9 25-6 30 4 5 8 1 18-5 23-8 7-19 7-27-2-8-10-8-17 2-25Z" fill="#cf945e"/>
    <path d="M12 18c6-6 17-7 24-2" stroke="#efbd7e" strokeWidth="4"/>
    <path d="M15 30c2 6 7 10 12 11m7-18 2 4" stroke="#a46b45" strokeWidth="2.7"/>
    <path d="m43 45-4 4" stroke="#ddc9a8"/>
  </>,
  pickles:<>
    <path d="M16 17h31v6l5 5v25c-9 6-32 6-41 0V29l5-6Z" fill="#c4ddba"/>
    <path d="M13 32h37v19c-8 5-29 5-37 0Z" fill="#b4d296" stroke="none"/>
    <rect x="13" y="10" width="36" height="10" rx="3" fill={leaf}/><path d="M18 13h25" stroke="#9bbe84" strokeWidth="2.5"/>
    <rect x="19" y="27" width="9" height="25" rx="4.5" transform="rotate(12 19 27)" fill="#638c55"/>
    <rect x="33" y="27" width="9" height="26" rx="4.5" transform="rotate(-10 33 27)" fill="#80a763"/>
    <path d="m23 33 0 1m-1 7 0 1m15-7 1 1m-1 7 0 1" stroke="#bed399" strokeWidth="2.5"/>
    <path d="M15 28v12" stroke="#edf1da" strokeWidth="2.8"/>
  </>,
  bread:<>
    <path d="M9 22C5 10 14 6 24 9c9-5 20-2 22 7 5 2 8 7 7 12v24L16 56 9 50Z" fill="#c99056"/>
    <path d="M19 24c-5-9 1-17 11-14 11-5 23 0 24 9 5 5 4 11-2 14v20H19V33c-5-1-5-6 0-9Z" fill="#e8b56d"/>
    <path d="M24 26c-4-7 0-11 7-9 9-4 17-1 18 5 5 3 3 7-2 9v17H24V31c-4-1-5-4 0-5Z" fill="#fff0cc" stroke="none"/>
    <path d="m30 27 1 1m10 10 1 1m-10 4 1 1m9-17 1 1" stroke="#e3c298" strokeWidth="2.4"/>
  </>,
  butter:<>
    <path d="m6 39 15-18 28 2 9 20-12 13-31-1Z" fill="#e3e4cf"/>
    <path d="m7 40 18 4-10 11m30-13 13 1-12 13" fill="#fff6df"/>
    <path d="m15 28 16-11 21 7v20L34 51 15 43Z" fill="#edb854"/>
    <path d="m15 28 16-11 21 7-18 10Z" fill="#ffe396"/>
    <path d="m15 28 19 6v17l-19-8Z" fill="#f8cf73"/>
    <path d="m19 29 14 3 11-6" stroke="#fff0b6" strokeWidth="2.6"/>
  </>,
  ice_cream:<>
    <path d="M13 31h39l-6 24H20Z" fill="#8fc1b7"/>
    <path d="M15 36h35l-3 9H17Z" fill="#fff2dc" stroke="none"/>
    <path d="M20 31c-9-3-9-12-2-17 3-10 19-10 24-3 11 0 17 12 10 18-2 5-9 7-14 2-5 6-12 5-18 0Z" fill="#fff3d8"/>
    <path d="M20 21c-1-5 3-8 7-8m12 6c5-1 8 1 9 4" stroke="#ead3b6" strokeWidth="2.7"/>
    <path d="m26 40 2 9m10-9-1 10" stroke="#559387"/>
    <path d="m23 24 2 1m11-12 2 1m5 13 2-1" stroke="#b77d56" strokeWidth="2.2"/>
  </>,
  coffee_beans:<>
    <ellipse cx="40" cy="24" rx="13" ry="17" transform="rotate(34 40 24)" fill="#9d6645"/>
    <path d="M46 11c-13 1 0 22-17 25" stroke="#573b2e" strokeWidth="3.3"/>
    <ellipse cx="22" cy="36" rx="14" ry="18" transform="rotate(-35 22 36)" fill="#aa7250"/>
    <path d="M12 23c15 0 1 22 20 26" stroke="#63412f" strokeWidth="3.5"/>
    <path d="M13 29c-1 5 1 9 3 11m24-26c3-2 5-1 7 0" stroke="#ce9c71" strokeWidth="2.4"/>
    <ellipse cx="46" cy="48" rx="9" ry="7" transform="rotate(-24 46 48)" fill="#805437"/><path d="m40 52 11-8" stroke="#4e3629" strokeWidth="2.5"/>
  </>,
  lemon:<>
    <path d="M10 35c2-14 12-24 28-22l7-2 3 7c13 9 9 26-5 33-10 5-23 3-29-5l-7-3Z" fill="#f6cd61"/>
    <path d="M16 32c2-7 7-12 13-13" stroke="#fff0ab" strokeWidth="4"/>
    <path d="M39 15C32 5 43 1 53 6c-1 8-7 13-14 9Z" fill={green}/><path d="m42 13 7-5" stroke={leaf}/>
    <path d="m37 44 1 1m6-11 1 1m-19 9 1 1" stroke="#dbaa43" strokeWidth="2.4"/>
  </>,
  sausage:<>
    <path d="m8 16 8 1-5 8-7-3Zm39 24 7-5 7 7-5 7Z" fill="#b96746"/>
    <path d="M20 13c5 2 6 6 4 11-2 7 2 16 10 18 4 2 9 0 13-2 8-3 13 7 7 12-7 6-17 9-28 3C12 49 6 31 10 20c2-7 5-9 10-7Z" fill="#cf7950"/>
    <path d="M18 20c-2 5-1 10 0 13m13 16c5 2 10 2 14-1" stroke="#f1b07c" strokeWidth="3.2"/>
    <path d="m15 33 7-3m-3 13 7-6m1 12 5-7" stroke="#965332" strokeWidth="2.4"/>
  </>,
  corn:<>
    <path d="M20 17c4-11 19-11 24 0l-1 29c-2 9-19 10-23 0Z" fill="#f2c255"/>
    <path d="M25 15v30m8-32v35m7-32v26M21 22h22M21 30h22M21 38h21" stroke="#daa340" strokeWidth="2"/>
    <path d="M28 17v4m8 5v3m-9 5v3" stroke="#fff0a5" strokeWidth="2.5"/>
    <path d="M9 27c15 0 27 19 24 29C18 55 8 47 9 27Z" fill="#8db970"/>
    <path d="M53 24c-17 5-25 22-22 34 15-3 24-16 22-34Z" fill="#5e9966"/>
    <path d="m16 36 16 20m14-22-15 22" stroke="#b9d393" strokeWidth="2.3"/>
  </>,
  chocolate:<>
    <path d="m14 10 34 2 4 32-34 9Z" fill="#7e5038"/>
    <path d="m19 16 9 1 1 10-10 1Zm14 1 10 1 1 10-10-1ZM20 32h10l1 11-10 2Zm15 0 10-1 1 10-10 2Z" fill="#a87450" stroke="#67442f" strokeWidth="1.8"/>
    <path d="m17 38 9 9 10-11 15 3 4 18-37 2Z" fill="#dc8774"/>
    <path d="m17 38 9 9 10-11 15 3-9 8-9-4-8 11Z" fill="#fff1d7"/>
    <path d="m23 17 3 1m12 1 3 1" stroke="#cb966a" strokeWidth="2.4"/>
  </>,
  strawberry:<>
    <path d="M31 18C9 9 4 29 14 42l17 16c8-5 17-12 22-24 6-16-8-23-22-16Z" fill="#e6765d"/>
    <path d="M31 20 17 16l8-5 6 3 8-6 3 9 9 2-11 6-8-3-7 6Z" fill={leaf}/>
    <path d="M14 29c1-4 3-5 6-5" stroke="#ffc5a2" strokeWidth="3.6"/>
    <path d="m24 32 1 2m12-4 1 2m7 5-1 2m-23 4 1 2m10-5 0 2m4 7-1 2" stroke="#ffe1a7" strokeWidth="2.6"/>
  </>,
  maple_syrup:<>
    <path d="M39 21c18-5 21 20 5 20" fill="none" strokeWidth="5.5"/>
    <path d="M39 21c18-5 21 20 5 20" fill="none" stroke="#e5bb82" strokeWidth="2"/>
    <path d="M23 12h15v10c0 4 7 7 9 12l-1 19c-8 5-25 5-33 0l-1-18c2-5 11-9 11-13Z" fill="#b9783f"/>
    <rect x="21" y="7" width="19" height="9" rx="3" fill={red}/><path d="M25 10h11" stroke="#f6b184"/>
    <path d="M17 31c6-5 20-5 27 0v18c-7 4-20 4-27 0Z" fill="#fff0cf" stroke="none"/>
    <path d="m30 32 3 6 5-3-1 6 5 1-9 6v3h-3v-3l-9-6 5-1-1-6 4 3Z" fill="#c77a3d" stroke="none"/>
  </>,
  avocado:<>
    <path d="M38 8c8 0 10 10 14 18 10 17 5 29-8 29-13 1-22-9-14-27 3-9 1-20 8-20Z" fill="#658653"/>
    <path d="M26 9c9 0 10 11 15 19 10 17 4 29-12 29S7 46 17 28c4-8 1-18 9-19Z" fill="#d1d894"/>
    <path d="M26 14c6 0 7 10 11 17 8 14 2 22-8 22S11 45 21 29c4-8 0-15 5-15Z" fill="#e9e6b3" stroke="none"/>
    <ellipse cx="29" cy="41" rx="9" ry="11" fill="#ac754d"/><path d="M24 38c1-3 2-4 4-4" stroke="#d4a775" strokeWidth="3"/>
  </>,
  apple:<>
    <path d="M31 21C18 11 5 20 8 36 10 54 24 60 32 54 42 60 55 50 56 34c1-15-12-23-25-13Z" fill="#df7157"/>
    <path d="M31 22c-2-7-1-13 3-18" stroke="#826143" strokeWidth="3.5"/>
    <path d="M33 16c0-9 10-13 20-8-3 8-12 13-20 8Z" fill={green}/><path d="m35 15 11-4" stroke={leaf}/>
    <path d="M15 30c1-4 4-6 7-6" stroke="#ffc3a0" strokeWidth="4"/>
    <path d="M36 50c7 1 12-4 14-10" stroke="#c15a45" strokeWidth="3"/>
  </>,
  chili:<>
    <path d="M45 16c7 0 13 6 11 14-3 15-25 26-46 23-4-1-5-3 0-4 21-5 21-15 23-24 1-6 7-10 12-9Z" fill="#e36f4f"/>
    <path d="M41 23c-1 9-4 15-12 21" stroke="#ffb185" strokeWidth="3.6"/>
    <path d="m34 21 6-7 11 2 5 8-10-2-4 5-3-5Z" fill={leaf}/>
    <path d="M44 16c2-8-1-11-7-10" stroke={leaf} strokeWidth="3.7"/>
  </>,
};

export interface IngredientArtProps {id:string;size?:number;className?:string}

/** Original collectible ingredient illustrations. The surrounding UI supplies the readable name. */
export function IngredientArt({id,size=48,className}:IngredientArtProps){
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={ink} strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true" focusable="false" className={className} style={{flexShrink:0}} data-ingredient={id}>
    <ellipse cx="32" cy="57" rx="23" ry="3" fill={ink} opacity=".10" stroke="none"/>
    {art[id]??<><path d="M17 18h30l5 34c-10 5-30 5-40 0Z" fill={cream}/><path d="M20 13h24l3 5H17Z" fill={gold}/><path d="M27 43c-7-12 5-17 13-15 0 11-5 17-13 15Z" fill={green}/></>}
  </svg>;
}
