import {Resvg} from '@resvg/resvg-js';
import {join} from 'node:path';

export const runtime='nodejs';
export const dynamic='force-static';

/** Public, deterministic PNG; no session, remote fetch or browser activation. */
export async function GET(){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><linearGradient id="shade"><stop offset="0.65" stop-color="#261b16"/><stop offset="1" stop-color="#261b16" stop-opacity="0"/></linearGradient></defs>
    <rect width="1200" height="630" fill="#261b16"/>
    <circle cx="879" cy="303" r="228" fill="#36564b"/>
    <circle cx="879" cy="303" r="210" fill="none" stroke="#a4bd91" stroke-opacity=".22" stroke-width="2" stroke-dasharray="5 10"/>
    <ellipse cx="879" cy="523" rx="243" ry="23" fill="#171410" opacity=".45"/>
    <g transform="translate(613 103) rotate(-4 240 240) scale(7.8)" stroke="#49362c" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">
      <path d="M7 19h33v30H7z" fill="#ef7958"/><path d="M40 29h10l8 10v10H40z" fill="#f8bc5b"/>
      <path d="M44 32h5l6 8H44z" fill="#9cd2ca"/><path d="M46 33h2l4 5h-6z" fill="#ceeae1" stroke="none"/>
      <path d="M10 12h27l5 9H5z" fill="#fff3d5"/>
      <path d="m13 12-2 9m11-9v9m9-9 2 9" stroke="#e77958" stroke-width="5.5"/>
      <path d="M5 22h37M7 43h33"/><rect x="12" y="26" width="23" height="13" rx="2" fill="#244c41"/>
      <path d="M12 40h23" stroke="#ffedc5" stroke-width="2"/><path d="M43 45h4M56 43v3"/>
      <circle cx="16" cy="50" r="6" fill="#49362c"/><circle cx="49" cy="50" r="6" fill="#49362c"/>
      <circle cx="16" cy="50" r="2.5" fill="#fff2d5" stroke="none"/><circle cx="49" cy="50" r="2.5" fill="#fff2d5" stroke="none"/>
      <path d="M18 34v-2q0-5 6-5t6 5v2z" fill="#efb34e"/><path d="M18 36h12" stroke="#95ad63" stroke-width="1.8"/><path d="M18 38h12" stroke="#df9461" stroke-width="2"/>
      <path d="m15 45 2 2m3-2 2 2m3-2 2 2" stroke="#ffe2bb"/>
    </g>
    <g fill="#ffd078"><path d="m687 116 5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/><path d="m1102 211 4 12 12 4-12 4-4 12-4-12-12-4 12-4z"/></g>
    <g transform="translate(971 84) rotate(12)"><rect x="0" y="0" width="123" height="63" rx="17" fill="#fff2d6"/><text x="61" y="42" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="28" fill="#345b4d">LET’S EAT</text></g>
    <rect width="760" height="630" fill="url(#shade)"/>
    <rect x="42" y="38" width="1116" height="554" rx="28" fill="none" stroke="#ffdda1" stroke-opacity=".2" stroke-width="2"/>
    <g font-family="Baloo 2" font-weight="800">
      <rect x="72" y="69" width="192" height="43" rx="22" fill="#c0dfbb"/>
      <text x="168" y="98" text-anchor="middle" font-size="21" letter-spacing="3" fill="#244c41">OPEN BETA</text>
      <text x="72" y="225" font-size="100" letter-spacing="-2" fill="#fff2d6">Domain</text>
      <text x="72" y="314" font-size="100" letter-spacing="-2" fill="#ffd078">Kitchen</text>
      <g font-size="29" fill="#f0dfc5"><text x="76" y="376">Your little restaurant.</text><text x="76" y="412">A whole road of possibilities.</text></g>
      <rect x="72" y="461" width="182" height="56" rx="16" fill="#e67c54"/>
      <text x="163" y="498" text-anchor="middle" font-size="26" fill="#261b16">Come on in</text>
      <text x="274" y="495" font-size="22" fill="#e6cfae">domainkitchen.xyz</text>
      <text x="1132" y="570" text-anchor="end" font-size="18" letter-spacing="3" fill="#e7d1ad">COOK · CREATE · EXPLORE</text>
    </g>
  </svg>`;
  const png=new Resvg(svg,{font:{fontFiles:[join(process.cwd(),'public/bots-art/fonts/Baloo2-ExtraBold.ttf')],loadSystemFonts:false}}).render().asPng();
  return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'}});
}
