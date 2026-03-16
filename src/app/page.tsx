'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { SUBDOMAINS, VALID_SUBDOMAINS } from '@/lib/subdomains';
import type { SubdomainKey } from '@/types';

/* ── Ticker labels ─────────────────────────────────────────────────────────── */
const TICKER_ITEMS = [
  'ETHEREUM', 'BITCOIN', 'DEFI', 'SOLANA', 'LAYER 2', 'STAKING',
  'BRIDGES', 'REAL-WORLD ASSETS', 'CRYPTO TAX', 'SECURITY',
  'CRYPTO LEGAL', 'EASY MODE', 'BEGINNER HUB', 'BIG MIKE',
  'WEB3GUIDES', 'SMART CONTRACTS', 'ZK PROOFS', 'VALIDATORS', 'ROLLUPS',
];

/* ── Featured spotlight cycle ──────────────────────────────────────────────── */
const FEATURED_KEYS: SubdomainKey[] = ['beginner', 'defi', 'eth', 'btc', 'security'];

/* ── SVG Icons per category ────────────────────────────────────────────────── */
function EthIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <polygon points="24,4 38,24 24,44 10,24" stroke={color} strokeWidth="1.5" fill="none" opacity="0.7" />
      <polygon points="24,4 38,24 24,18" fill={color} opacity="0.35" />
      <polygon points="24,44 10,24 24,30" fill={color} opacity="0.55" />
      <line x1="24" y1="4" x2="24" y2="44" stroke={color} strokeWidth="0.75" opacity="0.35" />
    </svg>
  );
}

function SolIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <line x1="6" y1="13" x2="42" y2="13" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <line x1="10" y1="24" x2="42" y2="24" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.65" />
      <line x1="6" y1="35" x2="38" y2="35" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <polyline points="42,10 46,13 42,16" fill={color} stroke={color} strokeWidth="1" opacity="0.8" />
      <polyline points="6,21 10,24 6,27" fill={color} stroke={color} strokeWidth="1" opacity="0.5" />
      <polyline points="38,32 42,35 38,38" fill={color} stroke={color} strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

function BtcIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <line x1="17" y1="6" x2="17" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <line x1="24" y1="6" x2="24" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <path d="M17 10 L29 10 C33 10 36 13 36 17 C36 21 33 24 29 24 L17 24" stroke={color} strokeWidth="2" fill="none" />
      <path d="M17 24 L30 24 C35 24 38 27 38 31 C38 35 35 38 30 38 L17 38" stroke={color} strokeWidth="2" fill="none" />
      <line x1="13" y1="11" x2="13" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="11" x2="27" y2="7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="13" y1="41" x2="13" y2="37" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="41" x2="27" y2="37" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DefiIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M24 5 L29 19 L43 19 L32 28 L36 42 L24 33 L12 42 L16 28 L5 19 L19 19 Z"
        stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M24 9 L28 20 L38 20 L30 26 L33 37 L24 31 L15 37 L18 26 L10 20 L20 20 Z"
        fill={color} opacity="0.2" />
    </svg>
  );
}

function StakingIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="11" y="22" width="26" height="20" rx="3" stroke={color} strokeWidth="1.5" />
      <path d="M17 22 L17 15 C17 10 31 10 31 15 L31 22" stroke={color} strokeWidth="1.5" fill="none" />
      <circle cx="24" cy="32" r="3.5" stroke={color} strokeWidth="1.5" />
      <line x1="24" y1="35.5" x2="24" y2="38.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="7" r="2.5" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="9.5" x2="24" y2="13" stroke={color} strokeWidth="1" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

function Layer2Icon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <ellipse cx="24" cy="38" rx="16" ry="5" stroke={color} strokeWidth="1.5" opacity="0.35" />
      <ellipse cx="24" cy="28" rx="16" ry="5" stroke={color} strokeWidth="1.5" opacity="0.6" />
      <ellipse cx="24" cy="18" rx="16" ry="5" stroke={color} strokeWidth="1.5" />
      <line x1="24" y1="13" x2="24" y2="5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <polyline points="19,8 24,5 29,8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function BridgeIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <line x1="4" y1="38" x2="44" y2="38" stroke={color} strokeWidth="2" />
      <line x1="8" y1="38" x2="8" y2="22" stroke={color} strokeWidth="1.5" />
      <line x1="40" y1="38" x2="40" y2="22" stroke={color} strokeWidth="1.5" />
      <path d="M8 22 Q24 8 40 22" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="16" y1="38" x2="18" y2="27" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="38" x2="24" y2="23" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="32" y1="38" x2="30" y2="27" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function RwaIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="8" y="20" width="32" height="22" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M4 22 L24 8 L44 22" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="19" y="30" width="10" height="12" stroke={color} strokeWidth="1.5" rx="1" />
      <line x1="13" y1="20" x2="13" y2="42" stroke={color} strokeWidth="1" opacity="0.4" />
      <line x1="35" y1="20" x2="35" y2="42" stroke={color} strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

function LegalIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <line x1="24" y1="6" x2="24" y2="44" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="11" x2="34" y2="11" stroke={color} strokeWidth="1.5" />
      <path d="M8 20 C8 24 14 26 14 26 C14 26 20 24 20 20 L14 18 Z" stroke={color} strokeWidth="1.2" fill="none" />
      <path d="M28 22 C28 26 34 28 34 28 C34 28 40 26 40 22 L34 20 Z" stroke={color} strokeWidth="1.2" fill="none" opacity="0.6" />
      <line x1="8" y1="44" x2="40" y2="44" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TaxIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="10" y="6" width="28" height="36" rx="3" stroke={color} strokeWidth="1.5" />
      <line x1="16" y1="16" x2="32" y2="16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="22" x2="32" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="16" y1="28" x2="26" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M28 32 L35 25 M35 32 L28 25" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SecurityIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M24 5 L8 11 L8 26 C8 36 16 43 24 45 C32 43 40 36 40 26 L40 11 Z"
        stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M24 9 L12 14 L12 26 C12 34 18 40 24 42 C30 40 36 34 36 26 L36 14 Z"
        fill={color} opacity="0.1" />
      <polyline points="17,24 22,30 32,19" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function EasyIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <circle cx="24" cy="19" r="11" stroke={color} strokeWidth="1.5" />
      <path d="M18 19 C18 15 24 11 30 15" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="24" y1="30" x2="24" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="34" x2="28" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="21" y1="38" x2="27" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="7" x2="24" y2="4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="37" y1="19" x2="40" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="11" y1="19" x2="8" y2="19" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="33" y1="10" x2="35" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
      <line x1="15" y1="10" x2="13" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

function BeginnerIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <path d="M24 42 L18 30 L24 7 L30 30 Z" stroke={color} strokeWidth="1.5" fill="none" />
      <path d="M18 30 L9 35 L24 7 Z" fill={color} opacity="0.3" />
      <path d="M30 30 L39 35 L24 7 Z" fill={color} opacity="0.5" />
      <ellipse cx="13" cy="35" rx="5" ry="3.5" stroke={color} strokeWidth="1.5" transform="rotate(-20 13 35)" />
      <ellipse cx="35" cy="35" rx="5" ry="3.5" stroke={color} strokeWidth="1.5" transform="rotate(20 35 35)" />
      <circle cx="24" cy="43" r="2" fill={color} opacity="0.5" />
    </svg>
  );
}

function BigMikeIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
      <rect x="18" y="6" width="12" height="20" rx="6" stroke={color} strokeWidth="1.5" />
      <path d="M11 24 C11 33 37 33 37 24" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="24" y1="33" x2="24" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18" y1="38" x2="30" y2="38" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="12" x2="26" y2="12" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="22" y1="17" x2="26" y2="17" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="22" y1="22" x2="26" y2="22" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

const ICONS: Record<string, React.FC<{ color: string }>> = {
  eth: EthIcon, sol: SolIcon, btc: BtcIcon, defi: DefiIcon,
  staking: StakingIcon, layer2: Layer2Icon, bridge: BridgeIcon,
  rwa: RwaIcon, legal: LegalIcon, tax: TaxIcon, security: SecurityIcon,
  easy: EasyIcon, beginner: BeginnerIcon, bigmike: BigMikeIcon,
};

/* ── Particle Canvas ───────────────────────────────────────────────────────── */
const ParticleCanvas = memo(function ParticleCanvas({ accentColor }: { accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accentColor);

  useEffect(() => {
    accentRef.current = accentColor;
  }, [accentColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    type Dot = { x: number; y: number; phase: number; speed: number };
    let dots: Dot[] = [];

    const dpr = () => window.devicePixelRatio || 1;

    const rebuild = () => {
      const d = dpr();
      canvas.width = canvas.offsetWidth * d;
      canvas.height = canvas.offsetHeight * d;
      ctx.scale(d, d);
      dots = [];
      const SPACING = 52;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      for (let x = 0; x <= w + SPACING; x += SPACING) {
        for (let y = 0; y <= h + SPACING; y += SPACING) {
          dots.push({ x, y, phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.45 });
        }
      }
    };

    rebuild();
    window.addEventListener('resize', rebuild);

    const hexToRgb = (hex: string): [number, number, number] => {
      const c = hex.replace('#', '');
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    };

    let [cr, cg, cb] = hexToRgb(accentRef.current);

    const animate = (t: number) => {
      const [tr, tg, tb] = hexToRgb(accentRef.current);
      const s = 0.018;
      cr += (tr - cr) * s;
      cg += (tg - cg) * s;
      cb += (tb - cb) * s;

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      const ts = t / 1000;
      for (const dot of dots) {
        const pulse = Math.sin(ts * dot.speed + dot.phase);
        const opacity = 0.035 + pulse * 0.04;
        if (opacity <= 0) continue;
        const r = Math.max(0.4, 1.3 + pulse * 0.7);
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)},${Math.max(0, opacity).toFixed(3)})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', rebuild);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
});

/* ── Main Page ─────────────────────────────────────────────────────────────── */
export default function ApexHomePage() {
  const [query, setQuery] = useState('');
  const [hoveredAccent, setHoveredAccent] = useState('#00F5D4');
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cursorGlowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Spotlight rotation
  useEffect(() => {
    const id = setInterval(() => setFeaturedIdx(i => (i + 1) % FEATURED_KEYS.length), 6000);
    return () => clearInterval(id);
  }, []);

  // Cursor glow follows mouse over grid
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onMove = (e: MouseEvent) => {
      const glow = cursorGlowRef.current;
      if (!glow) return;
      const rect = grid.getBoundingClientRect();
      glow.style.left = `${e.clientX - rect.left}px`;
      glow.style.top = `${e.clientY - rect.top}px`;
    };
    grid.addEventListener('mousemove', onMove);
    return () => grid.removeEventListener('mousemove', onMove);
  }, []);

  const isDev = process.env.NODE_ENV === 'development';
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'web3guides.com';
  const devRoot = process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ?? 'localhost:3000';
  const href = (key: string) => isDev ? `http://${key}.${devRoot}` : `https://${key}.${rootDomain}`;

  const filtered = query
    ? VALID_SUBDOMAINS.filter(k => {
        const q = query.toLowerCase();
        return SUBDOMAINS[k].label.toLowerCase().includes(q) ||
               SUBDOMAINS[k].description.toLowerCase().includes(q);
      })
    : VALID_SUBDOMAINS;

  const featuredKey = FEATURED_KEYS[featuredIdx];
  const featuredCfg = SUBDOMAINS[featuredKey];
  const FeaturedIcon = ICONS[featuredKey];

  // Cards: some indices get "tall" treatment for masonry height variation
  const TALL = new Set([0, 2, 5, 7, 11, 13]);

  return (
    <div style={{ background: '#080C10', minHeight: '100vh', fontFamily: '"IBM Plex Mono", monospace', color: '#e2e8f0' }}>

      {/* ── Sticky Nav ──────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '60px', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: '12px',
        transition: 'background 0.35s ease, border-color 0.35s ease, backdrop-filter 0.35s ease',
        background: scrolled ? 'rgba(8,12,16,0.88)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px) saturate(150%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(150%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.06)' : 'transparent'}`,
      }}>
        {/* Logo */}
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '22px', letterSpacing: '0.12em', color: '#00F5D4',
          flexShrink: 0,
        }}>
          W3G
        </span>

        {/* Divider */}
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Search */}
        <div style={{ flex: 1, maxWidth: '380px', margin: '0 auto', position: 'relative' }}>
          <svg style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.35, flexShrink: 0 }}
            width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke="#e2e8f0" strokeWidth="1.5" />
            <line x1="8.5" y1="8.5" x2="12" y2="12" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="nav-search"
            type="text"
            placeholder="Search hubs..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '6px',
              padding: '7px 12px 7px 32px',
              color: '#e2e8f0',
              fontSize: '12px',
              fontFamily: '"IBM Plex Mono", monospace',
            }}
          />
        </div>

        {/* Browse pill */}
        <a href="#hubs" style={{
          flexShrink: 0,
          padding: '7px 16px',
          borderRadius: '20px',
          border: '1px solid rgba(0,245,212,0.28)',
          color: '#00F5D4',
          fontSize: '11px',
          letterSpacing: '0.1em',
          textDecoration: 'none',
          fontFamily: '"IBM Plex Mono", monospace',
          transition: 'background 0.2s ease, box-shadow 0.2s ease',
          whiteSpace: 'nowrap',
        }}>
          BROWSE ALL HUBS
        </a>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        height: '60vh', minHeight: '420px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: '60px',
      }}>
        {/* Particle mesh */}
        <ParticleCanvas accentColor={hoveredAccent} />

        {/* Radial bloom behind wordmark — reacts to card hover color */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 55% 55% at 50% 40%, ${hoveredAccent}14, transparent 70%)`,
          transition: 'background 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />

        {/* Hard vignette at bottom to blend into ticker */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', pointerEvents: 'none',
          background: 'linear-gradient(transparent, #080C10)',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '0 24px' }}>
          {/* Status badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(8,12,16,0.75)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '20px', padding: '5px 14px',
            fontSize: '10px', letterSpacing: '0.12em',
            color: '#00F5D4', marginBottom: '20px',
            fontFamily: '"IBM Plex Mono", monospace',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#00F5D4',
              animation: 'dot-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }} />
            14 SPECIALIST EDUCATION HUBS · LIVE
          </div>

          {/* Wordmark */}
          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(68px, 11vw, 148px)',
            lineHeight: 0.9,
            letterSpacing: '0.05em',
            color: '#ffffff',
            margin: '0 0 20px',
            animation: mounted ? 'glitch-reveal 1.3s ease forwards' : 'none',
            opacity: mounted ? undefined : 0,
          }}>
            WEB3GUIDES
          </h1>

          <p style={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 'clamp(11px, 1.3vw, 13px)',
            color: '#3d5060',
            letterSpacing: '0.1em',
            maxWidth: '420px',
            margin: '0 auto',
            lineHeight: 1.8,
          }}>
            THE MOST THOROUGH CRYPTO EDUCATION<br />NETWORK ON THE INTERNET
          </p>
        </div>
      </section>

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,245,212,0.025)',
        overflow: 'hidden',
        padding: '11px 0',
        userSelect: 'none',
      }}>
        <div style={{
          display: 'flex',
          gap: '52px',
          whiteSpace: 'nowrap',
          width: 'max-content',
          animation: 'ticker-scroll 28s linear infinite',
        }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '10px',
              letterSpacing: '0.18em',
              color: i % 5 === 0 ? '#00F5D4' : i % 5 === 2 ? '#F5A623' : '#2a3a45',
            }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── Featured Spotlight ───────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1200px', margin: '52px auto 0', padding: '0 24px' }}>
        {/* Label row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.15em', color: '#2a3a45' }}>
            FEATURED HUB
          </span>
          <div style={{ display: 'flex', gap: '5px' }}>
            {FEATURED_KEYS.map((_, i) => (
              <button
                key={i}
                onClick={() => setFeaturedIdx(i)}
                style={{
                  width: i === featuredIdx ? '22px' : '6px',
                  height: '3px',
                  borderRadius: '2px',
                  background: i === featuredIdx ? '#00F5D4' : 'rgba(255,255,255,0.12)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'width 0.35s ease, background 0.35s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* Spotlight card */}
        <a
          key={featuredKey}
          href={href(featuredKey)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '28px',
            padding: '28px 32px',
            borderRadius: '16px',
            background: `linear-gradient(135deg, ${featuredCfg.gradientFrom}ee 0%, rgba(8,12,16,0.96) 100%)`,
            border: `1px solid ${featuredCfg.accentHex}28`,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            textDecoration: 'none',
            color: 'inherit',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: `0 0 48px ${featuredCfg.accentHex}12, 0 4px 24px rgba(0,0,0,0.4)`,
            animation: 'spotlight-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          }}
        >
          {/* Corner accent line */}
          <div style={{
            position: 'absolute', top: 0, left: '32px', right: '32px', height: '1px',
            background: `linear-gradient(90deg, transparent, ${featuredCfg.accentHex}60, transparent)`,
          }} />

          {/* Icon */}
          <div style={{ width: '72px', height: '72px', flexShrink: 0 }}>
            {FeaturedIcon && <FeaturedIcon color={featuredCfg.accentHex} />}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '10px', letterSpacing: '0.15em',
              color: featuredCfg.accentHex, marginBottom: '8px',
            }}>
              FEATURED HUB
            </div>
            <h2 style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(36px, 5vw, 56px)',
              letterSpacing: '0.04em',
              color: '#ffffff', margin: '0 0 8px', lineHeight: 1,
            }}>
              {featuredCfg.label.toUpperCase()}
            </h2>
            <p style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '12px', color: '#3d5060', margin: 0, lineHeight: 1.7,
            }}>
              {featuredCfg.description}
            </p>
          </div>

          {/* CTA arrow */}
          <div style={{ flexShrink: 0, color: featuredCfg.accentHex, opacity: 0.7 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M5 14 H23 M16 7 L23 14 L16 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </a>
      </section>

      {/* ── Card Grid ───────────────────────────────────────────────────────── */}
      <section id="hubs" style={{ maxWidth: '1200px', margin: '52px auto 96px', padding: '0 24px' }}>
        {/* Section label */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px', letterSpacing: '0.15em', color: '#2a3a45' }}>
            ALL HUBS &mdash; {filtered.length} OF {VALID_SUBDOMAINS.length}
          </span>
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                fontFamily: '"IBM Plex Mono", monospace', fontSize: '10px',
                letterSpacing: '0.1em', color: '#00F5D4',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              CLEAR ×
            </button>
          )}
        </div>

        {/* Cursor glow wrapper */}
        <div ref={gridRef} style={{ position: 'relative' }}>
          {/* Cursor radial */}
          <div
            ref={cursorGlowRef}
            style={{
              position: 'absolute',
              width: '380px', height: '380px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${hoveredAccent}0d 0%, transparent 65%)`,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              transition: 'background 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 0,
              left: '-9999px', top: '-9999px',
            }}
          />

          {/* Masonry grid */}
          <div className="card-columns">
            {filtered.map((key, i) => {
              const cfg = SUBDOMAINS[key];
              const Icon = ICONS[key];
              const tall = TALL.has(i);
              return (
                <a
                  key={key}
                  href={href(key)}
                  className="hub-card"
                  onMouseEnter={() => setHoveredAccent(cfg.accentHex)}
                  onMouseLeave={() => setHoveredAccent('#00F5D4')}
                  style={{
                    '--card-glow': cfg.glowHex,
                    '--card-border': `${cfg.accentHex}40`,
                    display: 'block',
                    marginBottom: '16px',
                    breakInside: 'avoid',
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(13,17,23,0.55)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    padding: tall ? '28px' : '22px',
                    textDecoration: 'none',
                    color: 'inherit',
                    position: 'relative',
                    overflow: 'hidden',
                    zIndex: 1,
                    animation: `card-cascade 0.55s cubic-bezier(0.34, 1.2, 0.64, 1) ${i * 50}ms both`,
                  } as React.CSSProperties}
                >
                  {/* Top accent line */}
                  <div style={{
                    position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
                    background: `linear-gradient(90deg, transparent, ${cfg.accentHex}50, transparent)`,
                    opacity: 0,
                    transition: 'opacity 0.25s ease',
                  }} className="card-top-line" />

                  {/* Hover gradient overlay */}
                  <div
                    className="card-hover-gradient"
                    style={{
                      position: 'absolute', inset: 0, borderRadius: '14px',
                      opacity: 0,
                      background: `linear-gradient(135deg, ${cfg.gradientFrom}70 0%, transparent 60%)`,
                      pointerEvents: 'none',
                      transition: 'opacity 0.25s ease',
                    }}
                  />

                  {/* Icon */}
                  <div className="card-icon" style={{ width: tall ? '52px' : '40px', height: tall ? '52px' : '40px', marginBottom: '14px', position: 'relative', zIndex: 1 }}>
                    {Icon && <Icon color={cfg.accentHex} />}
                  </div>

                  {/* Category label */}
                  <h3 style={{
                    fontFamily: '"Bebas Neue", sans-serif',
                    fontSize: tall ? '26px' : '20px',
                    letterSpacing: '0.05em',
                    color: '#ffffff',
                    margin: '0 0 8px',
                    lineHeight: 1.1,
                    position: 'relative', zIndex: 1,
                  }}>
                    {cfg.label.toUpperCase()}
                  </h3>

                  {/* Description */}
                  <p style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '11px',
                    lineHeight: '1.75',
                    color: '#3d5060',
                    margin: tall ? '0 0 20px' : '0 0 16px',
                    position: 'relative', zIndex: 1,
                  }}>
                    {cfg.description}
                  </p>

                  {/* URL */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '10px',
                    color: cfg.accentHex,
                    letterSpacing: '0.04em',
                    position: 'relative', zIndex: 1,
                  }}>
                    <span className="card-url">{key}.web3guides.com</span>
                    <span style={{ opacity: 0.45, fontSize: '12px' }}>→</span>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '80px 0',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '12px', color: '#2a3a45',
              letterSpacing: '0.08em',
            }}>
              NO HUBS FOUND FOR &ldquo;{query.toUpperCase()}&rdquo;
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '36px 24px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Scan-line texture */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)',
          zIndex: 0,
        }} />
        <p style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '11px',
          color: '#2a3a45',
          letterSpacing: '0.1em',
          margin: 0,
          position: 'relative', zIndex: 1,
        }}>
          © {new Date().getFullYear()} WEB3GUIDES &nbsp;·&nbsp; BUILT ON NEXT.JS 14 &amp; SUPABASE
        </p>
      </footer>
    </div>
  );
}
