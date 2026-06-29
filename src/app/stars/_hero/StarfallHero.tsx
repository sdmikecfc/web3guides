/**
 * STARFALL hero — a WebGL black-hole shader (ported from the Claude Design
 * "Black Hole Fleet Cinematic": real gravitational lensing, accretion disk with
 * doppler shift, photon ring, layered nebula + stars) with our own painted crew
 * flagship sprites maneuvering over it, and a 2D tracer-fire layer for the combat
 * energy (the good part of the original — minus the cheesy triangle fighters).
 *
 * Client component. Graceful fallback: no-WebGL leaves the CSS-gradient bg + the
 * sprites + content. rAF/WebGL does NOT render in headless preview — verify in a
 * real browser. Honors prefers-reduced-motion (static frame, no fire).
 */
"use client";

import { useEffect, useRef } from "react";

const VS = `attribute vec2 p; varying vec2 v_uv; void main(){ v_uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

const FS = `precision highp float;
varying vec2 v_uv;
uniform float u_aspect, u_phase, u_zoom, u_neb;
uniform vec2 u_pan, u_bh;
uniform float u_bhR, u_diskInner, u_diskOuter, u_diskTilt;
float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=hash21(i),b=hash21(i+vec2(1.,0.)),c=hash21(i+vec2(0.,1.)),d=hash21(i+vec2(1.,1.));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){ float v=0.,a=0.55; for(int i=0;i<5;i++){ v+=a*vnoise(p); p=p*2.02+1.7; a*=0.5; } return v; }
float starLayer(vec2 uv, float scale, float dens, float tw){
  vec2 g=uv*scale; vec2 id=floor(g); vec2 f=fract(g);
  float pres=step(1.0-dens, hash21(id+11.3));
  vec2 pos=vec2(hash21(id+3.1),hash21(id+7.7));
  float d=length(f-pos);
  float core=smoothstep(0.085,0.0,d);
  float tk=0.55+0.45*sin(6.2831*(tw+hash21(id)));
  return pres*core*tk;
}
void main(){
  vec2 c=(v_uv-0.5)*vec2(u_aspect,1.0);
  vec2 world=(c-u_bh)/u_zoom+u_bh+u_pan;
  vec2 d=world-u_bh;
  float r=length(d);
  vec2 dir=d/max(r,1e-4);
  vec2 tang=vec2(-dir.y,dir.x);
  float bend=u_bhR*1.15/(r+0.02);
  float swirl=0.06/(r*r+0.05);
  float ang=6.2831*u_phase;
  vec2 lw=world - dir*bend + tang*(swirl*0.10);
  float ca=cos(ang*0.05), sa=sin(ang*0.05);
  vec2 lw2=mat2(ca,-sa,sa,ca)*(lw-u_bh)+u_bh;
  float s=0.0;
  s+=starLayer(lw2,9.0,0.11,u_phase*1.0)*0.75;
  s+=starLayer(lw2+5.0,18.0,0.085,u_phase*1.7)*0.5;
  s+=starLayer(lw2+12.0,34.0,0.06,u_phase*0.6)*0.32;
  vec3 starCol=vec3(0.82,0.90,1.0);
  float n1=fbm(lw2*1.5+vec2(3.0,1.0));
  float n2=fbm(lw2*2.6-vec2(1.0,4.0)+n1);
  float neb=pow(clamp(n2,0.0,1.0),3.4)*u_neb;
  vec3 nebViolet=vec3(0.20,0.12,0.42);
  vec3 nebGold=vec3(0.34,0.24,0.12);
  vec3 nebCol=mix(nebViolet,nebGold,clamp(n1*0.7-0.12,0.0,1.0));
  vec3 col=vec3(0.003,0.012,0.020);
  col+=nebCol*neb*0.42;
  col+=starCol*s*(1.0-neb*0.4);
  vec2 dp=vec2(d.x, d.y/max(u_diskTilt,0.2));
  float rp=length(dp);
  float diskBand=smoothstep(u_diskInner,u_diskInner+0.020,rp)*(1.0-smoothstep(u_diskOuter-0.13,u_diskOuter,rp));
  float dopp=0.5+0.7*smoothstep(0.5,-0.7,dir.x);
  float dn=fbm(vec2(atan(dp.y,dp.x)*2.0+u_phase*6.2831, rp*13.0));
  float disk=diskBand*(0.6+0.6*dn)*dopp;
  vec3 diskCol=mix(vec3(1.0,0.72,0.28), vec3(1.0,0.95,0.74), smoothstep(u_diskInner,u_diskOuter,rp));
  col+=diskCol*disk*1.8;
  float topArc=smoothstep(0.026,0.0,abs(r-u_bhR*1.28))*smoothstep(0.0,-0.05,d.y);
  col+=vec3(1.0,0.88,0.60)*topArc*(0.7+0.6*fbm(vec2(atan(d.y,d.x)*3.0,u_phase*6.2831)));
  float ph=smoothstep(0.011,0.0,abs(r-u_bhR*1.16));
  col+=vec3(1.0,0.85,0.52)*ph*1.4;
  float glow=exp(-max(r-u_bhR,0.0)*8.0)*0.6;
  col+=vec3(1.0,0.74,0.36)*glow;
  float hor=smoothstep(u_bhR+0.004,u_bhR-0.004,r);
  col*=(1.0-hor);
  float vig=smoothstep(1.18,0.22,length(c));
  col*=mix(0.45,1.0,vig);
  col=col/(col+vec3(0.62))*1.18;
  float al=clamp(max(max(col.r,col.g),col.b)*1.7,0.0,1.0);
  al=max(al,hor);
  gl_FragColor=vec4(col,al);
}`;

const TAU = Math.PI * 2;
const LOOP_SECONDS = 14;
const BHN = { x: 0.635, y: 0.4 };

// Ship clusters in normalized [0..1] screen coords — match the sprite positions.
const CL = {
  gold: { x: 0.14, y: 0.63 },   // vanguard, lower-left — fire from midship, not below the hull
  violet: { x: 0.18, y: 0.18 }, // nebula, upper-left
  teal: { x: 0.87, y: 0.27 },   // pulsar, upper-right
  bh: { x: 0.635, y: 0.4 },     // black hole
};
const RGB: Record<string, string> = { gold: "255,184,92", violet: "156,124,255", teal: "94,234,212" };

export function StarfallHero({ children }: { children?: React.ReactNode }) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);

  // ── WebGL black hole ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = bgRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U: Record<string, WebGLUniformLocation | null> = {};
    ["u_aspect", "u_phase", "u_zoom", "u_neb", "u_pan", "u_bh", "u_bhR", "u_diskInner", "u_diskOuter", "u_diskTilt"].forEach(
      (n) => { U[n] = gl.getUniformLocation(prog, n); },
    );

    let aspect = 16 / 9;
    let bhc = { x: 0, y: 0 };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
      canvas.height = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      aspect = canvas.width / canvas.height;
      bhc = { x: (BHN.x - 0.5) * aspect, y: BHN.y - 0.5 };
    };
    resize();
    window.addEventListener("resize", resize);

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    const render = (now: number) => {
      const p = (((now - start) / 1000) / LOOP_SECONDS) % 1;
      gl.uniform1f(U.u_aspect, aspect);
      gl.uniform1f(U.u_phase, p);
      gl.uniform1f(U.u_zoom, 1.0 + 0.055 * (0.5 - 0.5 * Math.cos(TAU * p)));
      gl.uniform1f(U.u_neb, 0.0); // painted nebula-field.png is the backdrop; kill procedural nebula
      gl.uniform2f(U.u_pan, 0.012 * Math.sin(TAU * p), 0.006 * Math.sin(TAU * p + 1.0));
      gl.uniform2f(U.u_bh, bhc.x, bhc.y);
      gl.uniform1f(U.u_bhR, 0.085);
      gl.uniform1f(U.u_diskInner, 0.102);
      gl.uniform1f(U.u_diskOuter, 0.235);
      gl.uniform1f(U.u_diskTilt, 0.42);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  // ── 2D tracer fire (the combat energy) ──────────────────────────────────
  useEffect(() => {
    const canvas = fxRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 1, h = 1;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth || 1;
      h = canvas.clientHeight || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // build tracer lanes between clusters (+ a few toward the hole)
    // Only the two LEFT ships trade fire (gold vanguard ↔ violet nebula). Calm + sparse.
    const lanes: [keyof typeof CL, keyof typeof CL][] = [["gold", "violet"], ["violet", "gold"]];
    const jit = () => (Math.random() - 0.5) * 0.05;
    const tracers = Array.from({ length: 14 }, (_, i) => {
      const [fa, fb] = lanes[i % lanes.length];
      const a = CL[fa], b = CL[fb];
      return { ax: a.x + jit(), ay: a.y + jit(), bx: b.x + jit(), by: b.y + jit(), col: RGB[fa] || RGB.gold, fire: Math.random(), spd: 0.16 + Math.random() * 0.12 };
    });

    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const p = (now - start) / 1000;
      for (const t of tracers) {
        const lp = (p * t.spd + t.fire) % 1;
        if (lp > 0.5) continue; // intermittent: fires over the first half of its cycle
        const f = lp / 0.5;
        const x = (t.ax + (t.bx - t.ax) * f) * w;
        const y = (t.ay + (t.by - t.ay) * f) * h;
        const dx = (t.bx - t.ax) * w, dy = (t.by - t.ay) * h;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const a = Math.sin(f * Math.PI) * 0.85;
        ctx.strokeStyle = `rgba(${t.col},${a})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - ux * 22, y - uy * 22);
        ctx.lineTo(x + ux * 8, y + uy * 8);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    if (reduced) draw(start);
    else raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100dvh",
        overflow: "hidden",
        background: "radial-gradient(1200px 620px at 64% 40%, #0a1322 0%, #050912 72%)",
      }}
    >
      {/* painted nebula backdrop (behind the transparent black-hole shader) */}
      <img src="/stars-art/nebula-field.png" alt="" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      <canvas ref={bgRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 0 }} />

      {/* crew flagships, banking and drifting like they're maneuvering */}
      <img src="/stars-art/flagship-vanguard.png" alt="" aria-hidden="true"
        style={ship({ left: "3%", top: "54%", w: "clamp(170px, 30vw, 360px)", anim: "sf-a 9s", glow: "rgba(240,179,64,0.4)" })} />
      <img src="/stars-art/flagship-pulsar.png" alt="" aria-hidden="true"
        style={ship({ right: "8%", top: "16%", w: "clamp(90px, 13vw, 156px)", anim: "sf-b 8s", glow: "rgba(94,234,212,0.34)" })} />
      <img src="/stars-art/flagship-nebula.png" alt="" aria-hidden="true"
        style={ship({ left: "13%", top: "10%", w: "clamp(80px, 12vw, 144px)", anim: "sf-c 13s", glow: "rgba(124,106,255,0.34)" })} />

      {/* tracer-fire layer over the ships */}
      <canvas ref={fxRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 1, pointerEvents: "none" }} />

      {/* legibility scrim + edge vignette */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, background: "linear-gradient(180deg, rgba(5,9,18,0) 20%, rgba(5,9,18,0.5) 54%, rgba(5,9,18,0.16) 82%, rgba(5,9,18,0) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, boxShadow: "inset 0 0 240px 70px rgba(0,5,11,0.72)" }} />

      {/* content */}
      <div style={{ position: "relative", zIndex: 2, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "48px 20px" }}>
        {children}
      </div>

      <style>{`
        @keyframes sf-a { 0%,100%{ transform: translate(0,0) rotate(-3deg) } 50%{ transform: translate(22px,-24px) rotate(0deg) } }
        @keyframes sf-b { 0%,100%{ transform: translate(0,0) rotate(5deg) } 50%{ transform: translate(-54px,36px) rotate(-3deg) } }
        @keyframes sf-c { 0%,100%{ transform: translate(0,0) rotate(7deg) } 50%{ transform: translate(16px,18px) rotate(10deg) } }
      `}</style>
    </div>
  );
}

function ship(o: { left?: string; right?: string; top: string; w: string; anim: string; glow: string }): React.CSSProperties {
  return {
    position: "absolute",
    left: o.left,
    right: o.right,
    top: o.top,
    width: o.w,
    height: "auto",
    opacity: 0.95,
    pointerEvents: "none",
    zIndex: 1,
    filter: `drop-shadow(0 0 28px ${o.glow})`,
    animation: `${o.anim} ease-in-out infinite`,
  };
}
