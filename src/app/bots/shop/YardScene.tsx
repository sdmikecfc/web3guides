/**
 * THE YARD, DRAWN (lane 4, 2026-09-06).
 *
 * WHAT WAS HERE. The band's two props were `/bots-art/props/shop-shelf.png`
 * and `/bots-art/props/shop-crate.png`: a mint-and-coral bookcase with a
 * flower carved into its crown, and a pastel picnic crate. Mike, looking at
 * the built screen: "the shelf art is a pink and teal nursery bookcase. The
 * game is a JUNKYARD where a truck drops parts every day."
 *
 * WHY DRAWN AND NOT ASKED FOR. The art factory (scripts/sd/**, art-src/sd/**)
 * is a separate workstream and is not to be touched from here, so the scene is
 * re-dressed out of shapes: a tipper truck backed into the yard with its bed
 * up and today's parts tumbling out of it, a fence of corrugated tin behind,
 * a stack of tyres and a drum of bolts on the far side. Nothing new is loaded,
 * so nothing new can 404, and the band draws the same with public/bots-art
 * removed (the house law).
 *
 * THE PALETTE IS THE GAME'S. Clay (#c7cdd6), rubber (#3a3a3f) and brass
 * (#d9a441) come from _ui/tokens.ts K, so the yard is the same toy the bots
 * are moulded from, weathered rather than gritty. A seven year old should read
 * "the truck brought the parts", not "this is a scrapheap".
 *
 * NOTHING HERE IS IN THE FIGHT. This file draws; it imports no engine module
 * and no look. A replay hash cannot move because a truck changed colour.
 */
"use client";

/** the yard's own weathered spectrum, one place, warm and low contrast */
const Y = {
  truck: "#b8563f",
  truckDark: "#94402d",
  truckLight: "#cf6c53",
  steel: "#a9a294",
  steelDark: "#7d7669",
  steelLight: "#c6bfb1",
  rubber: "#3a3a3f",
  rubberLight: "#54545c",
  clay: "#c7cdd6",
  clayDark: "#a5aebb",
  brass: "#d9a441",
  glass: "#bfe9ff",
  drum: "#7f9aa6",
  drumDark: "#5f7783",
  shadow: "rgba(72,58,40,0.18)",
} as const;

/**
 * THE PARTS TRUCK. Cab to the left, bed hinged at the back and raised, so the
 * load slides out to the right and lands where the day's parts are laid out.
 * The tipping is the whole point of the picture: it says a truck DROPPED
 * these, which is the one sentence the screen has to teach.
 */
export function TruckProp({ height }: { height: number }) {
  return (
    <svg
      /* cropped to what is actually drawn: a 0 0 300 200 box left a third of
         the prop as empty air, so a 200 tall slot rendered a 133 tall truck */
      viewBox="16 56 288 141"
      height={height}
      width={height * (288 / 141)}
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block", overflow: "visible" }}
    >
      {/* the ground it stands on */}
      <ellipse cx="150" cy="182" rx="132" ry="11" fill={Y.shadow} />

      {/*
       * A FLATBED, LOADED, WITH THE BACK LET DOWN. It was a tipper first, bed
       * swung up on a ram: at band size the raised bed read as a plough blade
       * fallen off the back, and its low corner buried itself behind the rear
       * wheel. Nothing rotates now. The load sits on the deck in plain sight
       * and a couple of parts have rolled down the open tailgate onto the
       * dirt, which says the same sentence and cannot be misread.
       */}

      {/*
       * THE LOAD. Clay lumps read as rubble; these read as ROBOT PARTS,
       * because one of them is a head with two glass eyes and a person reads a
       * face before they read anything else. A body, a head, an arm, a foot
       * and a bolt: the same five things the page below is selling.
       */}
      <g>
        {/* a body, chest panel and all */}
        <rect x="130" y="76" width="54" height="40" rx="16" fill={Y.clay} />
        <rect x="141" y="88" width="32" height="18" rx="5" fill={Y.clayDark} opacity="0.55" />
        {/* a head, tipped on its side on top of the pile */}
        <ellipse cx="208" cy="84" rx="27" ry="22" fill={Y.clay} />
        <circle cx="198" cy="80" r="6" fill={Y.glass} />
        <circle cx="217" cy="80" r="6" fill={Y.glass} />
        <rect x="196" y="94" width="24" height="7" rx="3" fill={Y.rubber} opacity="0.7" />
        {/* an arm, and a foot poking out at the front */}
        <rect x="186" y="100" width="60" height="20" rx="10" fill={Y.clayDark} />
        <rect x="120" y="98" width="34" height="18" rx="9" fill={Y.clayDark} />
        {/* a bolt, not a ball: the brass circle floated beside the head with
            nothing to say it was hardware until it got a socket in it */}
        <circle cx="241" cy="88" r="9" fill={Y.brass} />
        <circle cx="241" cy="88" r="3.4" fill={Y.truckDark} opacity="0.45" />
      </g>

      {/* the deck, its low side rail, and the exhaust behind the cab */}
      <rect x="118" y="60" width="10" height="58" rx="5" fill={Y.steelDark} />
      <rect x="118" y="98" width="136" height="20" rx="4" fill={Y.steel} />
      {[132, 152, 172, 192, 212, 232].map((x) => (
        <rect key={x} x={x} y="103" width="5" height="11" rx="2" fill={Y.steelDark} opacity="0.4" />
      ))}
      <rect x="118" y="98" width="136" height="6" rx="3" fill={Y.steelLight} />
      <rect x="116" y="116" width="140" height="14" rx="4" fill={Y.steelDark} />

      {/* the chassis rail under it all */}
      <rect x="48" y="128" width="200" height="15" rx="5" fill={Y.truckDark} />

      {/* THE CAB, flat fronted the way a toy truck is */}
      <rect x="40" y="74" width="80" height="68" rx="11" fill={Y.truck} />
      <rect x="40" y="74" width="80" height="13" rx="7" fill={Y.truckLight} />
      <rect x="52" y="90" width="50" height="27" rx="5" fill={Y.glass} />
      <rect x="52" y="90" width="50" height="9" rx="5" fill="#e4f6ff" />
      {/* the door line, the lamp, the bumper */}
      <rect x="106" y="96" width="4" height="40" rx="2" fill={Y.truckDark} opacity="0.55" />
      <circle cx="50" cy="132" r="6" fill={Y.brass} />
      <rect x="32" y="128" width="20" height="14" rx="5" fill={Y.steelDark} />

      {/* two wheels, the same size, both under the chassis */}
      {[80, 212].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="148" r="27" fill={Y.rubber} />
          <circle cx={cx} cy="148" r="19" fill={Y.rubberLight} />
          <circle cx={cx} cy="148" r="11" fill={Y.steelLight} />
          <circle cx={cx} cy="148" r="4" fill={Y.steelDark} />
        </g>
      ))}

      {/*
       * THE TAILGATE, LET DOWN INTO A RAMP. It was a 10px sliver, which at
       * band size read as a broken pole leaning off the back of the truck. It
       * is a board now, as deep as the deck, with a lit top face and a lip at
       * the bottom where it meets the dirt, so it reads as the way DOWN.
       */}
      <polygon points="246,110 268,112 306,166 288,178" fill={Y.steelDark} />
      <polygon points="246,110 264,111 300,163 288,168" fill={Y.steel} />
      <polygon points="248,111 260,111 290,155 282,158" fill={Y.steelLight} />
      <rect x="286" y="166" width="22" height="7" rx="3" fill={Y.steelDark} transform="rotate(12 297 169)" />

      {/*
       * WHAT HAS ROLLED OFF IT. Three grey pebbles and a bolt said "rubble".
       * A head with two eyes, an arm and one bolt say "the parts came off the
       * truck", which is the sentence the whole picture is for: a person
       * reads a face before they read anything else.
       */}
      <rect x="214" y="164" width="38" height="19" rx="9" fill={Y.clayDark} />
      <rect x="222" y="168" width="16" height="6" rx="3" fill={Y.clay} opacity="0.6" />
      <ellipse cx="266" cy="172" rx="23" ry="18" fill={Y.clay} />
      <circle cx="258" cy="169" r="5" fill={Y.glass} />
      <circle cx="274" cy="169" r="5" fill={Y.glass} />
      <rect x="256" y="180" width="20" height="6" rx="3" fill={Y.rubber} opacity="0.65" />
      <circle cx="291" cy="183" r="8" fill={Y.brass} />
      <circle cx="291" cy="183" r="3" fill={Y.truckDark} opacity="0.45" />
    </svg>
  );
}

/**
 * THE FAR CORNER OF THE YARD: a stack of tyres, a drum of bolts, and a bent
 * sheet of tin leaning on them. It closes the picture on the right, where the
 * pastel crate used to sit, and it is the same weathered spectrum as the
 * truck, so the two ends of the band belong to one place.
 */
export function HeapProp({ height }: { height: number }) {
  return (
    <svg
      viewBox="0 0 210 200"
      height={height}
      width={height * 1.05}
      aria-hidden
      focusable="false"
      style={{ flex: "0 0 auto", display: "block", overflow: "visible" }}
    >
      <ellipse cx="105" cy="186" rx="98" ry="10" fill={Y.shadow} />

      {/* the leaning sheet of tin, behind everything */}
      <g transform="rotate(-8 150 130)">
        <rect x="120" y="74" width="66" height="104" rx="5" fill={Y.steel} />
        {[128, 142, 156, 170].map((x) => (
          <rect key={x} x={x} y="80" width="5" height="92" rx="2" fill={Y.steelDark} opacity="0.45" />
        ))}
        <rect x="120" y="74" width="66" height="7" rx="3" fill={Y.steelLight} />
      </g>

      {/* the drum of bolts, lid off, brass spilling over the rim */}
      <g>
        <rect x="96" y="112" width="62" height="68" rx="8" fill={Y.drum} />
        <rect x="96" y="126" width="62" height="7" fill={Y.drumDark} opacity="0.55" />
        <rect x="96" y="158" width="62" height="7" fill={Y.drumDark} opacity="0.55" />
        <ellipse cx="127" cy="112" rx="31" ry="10" fill={Y.drumDark} />
        <ellipse cx="127" cy="110" rx="24" ry="7" fill={Y.brass} />
        <circle cx="112" cy="106" r="5" fill={Y.brass} />
        <circle cx="140" cy="105" r="4" fill={Y.brass} />
      </g>

      {/*
       * THE STACK OF TYRES. The lower two show only their tread edge; the top
       * one shows its hole, centred, which is the thing that makes the stack
       * read as tyres rather than as three black stones.
       */}
      {[168, 144].map((cy) => (
        <g key={cy}>
          <ellipse cx="52" cy={cy} rx="46" ry="17" fill={Y.rubber} />
          <path d={`M8 ${cy - 3} A46 17 0 0 0 96 ${cy - 3}`} fill="none" stroke={Y.rubberLight} strokeWidth="3" opacity="0.55" />
        </g>
      ))}
      <ellipse cx="52" cy="120" rx="46" ry="17" fill={Y.rubber} />
      <ellipse cx="52" cy="119" rx="19" ry="7" fill="#26262b" />

      {/* a head resting on the stack, so the pile is unmistakably PARTS */}
      <ellipse cx="56" cy="96" rx="27" ry="21" fill={Y.clay} />
      <circle cx="47" cy="92" r="6" fill={Y.glass} />
      <circle cx="66" cy="92" r="6" fill={Y.glass} />
      <rect x="45" y="105" width="22" height="6" rx="3" fill={Y.rubber} opacity="0.7" />
    </svg>
  );
}
