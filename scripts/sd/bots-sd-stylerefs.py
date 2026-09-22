"""BATTLE BOTS / stable-diffusion lane: THE CLEAN STYLE REFERENCES.

    python scripts/sd/bots-sd-stylerefs.py            # cut, clean, manifest, contact sheet
    python scripts/sd/bots-sd-stylerefs.py --model u2net   # a different matting model
    python scripts/sd/bots-sd-stylerefs.py --only arm-coral   # one reference

Takes the raw concept crops that bots-sd-stylecut.py indexes, removes their
backgrounds, and writes the set the IP-Adapter is fed:

    art-src/sd/style/clean/<name>.png        RGB, SQUARE, the part alone on a flat
                                             neutral plate (the matrix's grey)
    art-src/sd/style/clean/<name>.alpha.png  the matte, for review and reuse
    art-src/sd/style/clean/manifest.json     name, source scene, box, what it is for
    art-src/sd/style/clean/_contact.jpg      the whole set at a glance

── WHY THE BACKGROUND HAS TO GO ───────────────────────────────────────────
Measured by hand on the box on 2026-09-05: with a concept crop as the style
image at adapter scale 0.4 the head came back as warm pastel clay with chrome
bezels, a coral lit lens, the grille mouth and the ear cups, the shape still
bound by the control; at 0.8 the reference's own background (a crowd, a
corkboard) leaked into the render. The adapter encodes the WHOLE reference
through CLIP, so whatever is behind the robot is part of the style it argues
for. Remove it, and the sweep's adapter axis measures the robot and nothing
else.

── WHY SQUARE, AND WHY THIS PLATE ─────────────────────────────────────────
diffusers' default CLIPImageProcessor resizes the shortest side to 224 and
CENTRE CROPS a 224 square. A tall reference loses its feet and its crown to
that crop without a word. So every reference here is padded to a square on
the plate before it is saved, and the robot sits whole inside the crop.
The plate is the matrix's grey (#808080): the same flat neutral field the
renders are drawn on, so the reference does not argue for a plate colour the
render will not have.

── WHAT IS IN THE SET, AND WHAT IS NOT ────────────────────────────────────
The concept art is the law. Whole robots (bot-*) carry proportions and the
finish; heads (head-*) carry the face: the bezel, the lit lens, the grille.
Torsos (torso-*) carry the barrel and the brass key. Arms (arm-*) carry the
jointed limb, the elbow ball, the cuff and the mitt or claw at the end. Legs
(leg-*) carry the boot: the thick sole, the ankle band, the coral toes.
Weapons (weapon-*) carry the prop: a hammer head with bands and a bolt, a
wrench. Anything named b1 is the OLD anchor and is excluded by name here, as
it is excluded from the raw cut; the anchor's shoulder bolts contradict the
join law. head-2 in the first cut was pure wall; the crop table in stylecut
was re-measured, and this file refuses a reference whose matte covers under
MIN_COVER of its crop (a wall cuts to nothing) rather than shipping it.

── WHY LIMBS NEED LIMB REFERENCES (2026-09-05) ────────────────────────────
Measured today on the box: with a whole-toy reference (bot-2) as the style
image, the arm placeholder came back with a whole robot painted inside it,
faces, feet and lamps, because a featureless capsule under a whole-toy style
has nothing to be except a small whole toy. The adapter argues for what it is
shown. So the limb slots get references that are limbs and nothing else: one
arm, one boot, one hammer, each alone on the plate, cut from the parts shelf
in 6-shop.png, which already shows the exact vocabulary the placeholders
need to grow: jointed arms ending in mitts and claws with an elbow ball,
boots with a thick sole and an ankle band and coral toes, torsos with the
wind-up key, a wrench and a hammer.

── THE SHELF ROWS ARE AUTHORED HERE, NOT DETECTED ─────────────────────────
bots-sd-stylecut.py finds the shelf rows by density. That works for the head
row, where ten heads stand apart. It does not work for the other rows: the
arm and foot rows stand in touching pairs, so every detected arm-shelfNN and
leg-shelfNN crop holds two or three parts and a slice of a neighbour, and the
top shelf's background is the bright shop window, so the torso row comes out
as one run 2,000 px wide and torso-shelf01 is actually the arm hanging beside
the blue torso. So every limb, torso and weapon reference below carries its
OWN box in source pixels, measured off 6-shop.png on 2026-09-05 with a ruler
grid, and is named for what it is (arm-coral, leg-boot-red), not for the
detected crop it sits inside; the manifest records which raw crop that is.
The head and bot references are untouched and still read their boxes from
index.json.

── ONE LIMB, NOT THE PAIR ─────────────────────────────────────────────────
The shelf sells boots and arms in pairs. Every pair here is cut to ONE limb:
the rig mirrors a limb to make its twin, so a pair teaches nothing the single
does not, and a pair on the plate reads to CLIP as two objects (or one wide
object with a gap), which is exactly the wrong shape for a placeholder that
is one capsule. Which one of the pair: whichever stands clear of the price
tag, which is the left one on this shelf every time but one (the red boots'
tag hangs off the RIGHT boot's leg, so the left boot is cut, though the
detector never found it, standing as it does at the cabinet's edge). Where
a torso has arms attached (blue, red), the arms are cut off at the box edge
on purpose: a torso reference that shows arms argues for arms on a barrel.

── THE PLINTH, THE FLOOR AND THE X CLIP ───────────────────────────────────
Every shelf part stands on a turned wooden plinth, and the matting model
keeps it, because a part-on-a-plinth is one salient object. An adapter fed a
plinth will put one under a generated part. The first version tried to trim
the plinth AFTER matting by dark rows, and the red head (shelf04) kept its
plinth because the plinth's teal stripe and lit rim are not dark. What IS
constant is the geometry: measured down the centre column of three shelf
heads on 2026-09-05, every head meets its plinth at a dark seam at y 1008 of
6-shop.png (value 0.05 to 0.18 against 0.3 to 0.7 on either side), because
the whole row stands on one shelf. So a reference carries `floorY`, an
absolute floor in source pixels, and the matte is zeroed from that row down.

The other rows were measured the same way, single columns at 1 px, value =
max(r, g, b), on 2026-09-05:

  torso row   the teal torso meets its plinth at y 382-384 (0.19, 0.19, 0.15
              at x 930; 0.09-0.11 at x 800), plinth top from 385 (0.34, 0.60);
              the red torso at 381-382 (0.27, 0.22 at x 1290), plinth from 383.
              SHELF_TORSO_FLOOR_Y = 384; the blue and cream torsos overhang
              their plinths' back rim and carry their own floor (388, 390).
  arm row     the coral arm's cap meets its plinth at y 688-691 (0.16, 0.12,
              0.10, 0.12 at x 1320), plinth top 0.44 from 692; the teal mitt
              at 687-688 (0.34, 0.14 at x 1030); the teal pincer at 686-688
              (0.26, 0.20, 0.10 at x 2300). SHELF_ARM_FLOOR_Y = 692. The
              white-cuff arm's mitt sits lower (0.23, 0.11 at 694-695,
              x 1855) and carries 695.
  leg row     there is NO one floor: a flat sole meets the plinth at the
              back of its curve (red 1352-1353 at x 330, purple 1348-1353 at
              x 944) but its deepest point is further forward (red 1362-1364
              at x 300, yellow 1365-1369 at x 570, purple 1364-1368 at x 850,
              teal 1359-1362 at x 1400), the wheel feet's tyres end at
              1363-1367 (x 2040, 2070, 2320) and the coral toes come forward
              to 1372-1374 (x 1715). A row floor at the back seam would cut
              every toe off, so every leg carries its own floor, 1 to 2 px
              under its deepest measured point. The coral toes and the mitts
              are the point of the exercise; nothing here trims them.
  weapon row  the weapons stand on small plinths of their own: the hammer's
              handle enters its plinth at 411 (rim highlight 0.74-0.92 at
              412-415, x 1963), the wrench's handle ring ends at 411 (x 2062;
              rim 0.68-0.83 at 411-412 beside it), the spring claw's coil at
              408 (x 2245), the drill's body at 401 (0.18-0.25 from 402,
              x 2440). Each carries its own floor.

Because the pairs touch and the torsos' arms are attached, a floor alone is
not enough: `clipX` zeroes the matte outside the reference's own box columns
(the context the matting model sees is still wider), so the twin boot, the
hanging arm or the neighbouring hammer head stops at the box edge instead of
riding along as a second component. The head and bot references do not clip;
nothing about their path changed.

── THE TAGS ───────────────────────────────────────────────────────────────
Every plinth wears a paper price tag on a string. Nearly all of them hang
below their row's floor and go with the plinth. Two do not: the blue torso's
tag hangs from its left shoulder cap and its top sits at y 377, above the
torso's floor, and the drill's tag top sits at 397, above the drill's floor.
Those two references carry `excludePolys`, hand polygons in source pixels
(white = drop, the same contract as an `_exclude/<name>.png` mask), and the
manifest records how many matte pixels each one removed. Most strings are
one pixel wide and do not survive the matte; three do (they run beside a
chrome mitt, off the hammer's handle, beside the cream torso's cap) and are
cut by polygon the same way, as are the two bits of lit plinth rim that show
above a floor: left of the red claw, and under the blue torso's right cap.
Every polygon was placed on a 5 px ruler grid at native resolution, not
guessed; the first white-cuff polygon, placed off a coarser grid, notched
the mitt, which is why the rule exists.

── SOFT HALOS ─────────────────────────────────────────────────────────────
Beside a mitt that rests on its plinth the matting model returns soft alpha
(0.1 to 0.4) over the plinth's lit rim. That never crosses 0.5, so the
floor, the clip and the component filter never see it, but composited on
the plate it is a faint light smear next to the part (seen beside the
white-cuff mitt, the teal-cuffs mitt and the red claw on 2026-09-05). For
the authored shelf parts, soft alpha further than HALO_PX from a solid
(over 0.5) pixel is dropped; the part's own soft edge, which touches solid
pixels, stays. The head and bot references do not pass through this and
their outputs are byte-identical to before it existed (checked by hash).

── WHICH MATTING MODEL, AND WHY THREE REFERENCES NAME THEIR OWN ───────────
isnet-general-use is the default and cuts the heads, the bots and most of
the limbs cleanly. It drops three things, measured on 2026-09-05 by running
every model cached on this box (isnet-general-use, u2net, u2net_human_seg)
over the failures: the hammer's coral handle against the warm shop wall
(isnet keeps the head alone, 25% cover; u2net keeps head and handle, 32%),
the coral-toed foot's dark blue leg against the dark shelf back (isnet
returns one toe and the hub, 9%; u2net returns the whole leg, 39%), and the
bent teal arm's dark segments between its two chrome balls (isnet returns
the balls, 26%; u2net the whole arm, 45%). Those three carry `model: u2net`
and the manifest says so per reference. Nothing else moved: the default
model, and the head and bot references' path through it, are unchanged.

The red torso is a different failure: it fills its own box edge to edge, so
the matting model saw no object boundary and returned the salient thing
inside, the key window (20% cover). It carries `matteBox`, a wider box the
matting model sees (the torso with both blue arms, a clear object against
the window), and the x clip then takes the arms off at the shoulder balls.

The blue torso's shadowed lower-left corner (dark blue on dark wood) mattes
soft under all three models and is shipped that way with a note in its
goodFor; torso-teal is the torso to reach for first.

The hero in 2-build.png stands on a red scissor lift whose top shares the
coral feet's hue and saturation (platform hue 11 to 15, sat 0.60 to 0.64;
feet hue 9 to 16, sat 0.59 to 0.78, measured), so no colour rule separates
them. A reference may therefore name an EXCLUSION mask,
art-src/sd/style/clean/_exclude/<name>.png (white = drop), made by whatever
tool cuts it best (Firefly's select-by-prompt, or a hand polygon); the
cleaner subtracts it from the matte and records that it did.

── THE CORAL SOLE ON THE BOOT REFERENCES (2026-09-05, lane B) ─────────────
The shelf boots wear dark brown, yellow or striped soles, and an adapter fed
them argues for exactly that. The v2 leg ruler draws ONE coral sole block
under a dome boot and the leg prompt asks for it, so the four boot
references (leg-boot-red, -yellow, -purple, -teal) carry `coralSole`, an
absolute source-pixel row measured on the same 4x grid the floors were
measured on: every matte pixel from that row down to the floor is PINNED to
the shoe coral scripts/bots-import-parts.py pins every leg to (#B46D52: all
three channels scaled together, so hue 16.5 and saturation 0.54 are
constants and the crop's own shading rides on value), with one gain per
reference that puts the block's median value at the coral's own 0.71 and
the deviation from that value halved and held between 0.30 and 0.85, so the
block is ONE flat coral and not the crop's highlights in pink. The
row sits at 0.42 to 0.45 of the shoe (the toe cap's top to the floor), the
share the ruler's SOLE_H_V2 and the live boot's block use, so the reference
shows what the control maps ask for: a straight top edge, one block, the
only coral on the part. Measured rows: red, shoe 1300 to 1365, sole from
1336; yellow, shoe 1290 to 1370, from 1336; purple, shoe 1300 to 1369, from
1340; teal, shoe 1300 to 1363, from 1337. The toes carry no sole. The
manifest records the row, the pixels pinned and the gain.

── THE CORAL TYRE, TRIED AND REFUSED (2026-09-05, lane B) ─────────────────
The v3 leg table (scripts/bots-bake-parts.mjs --out v3) adds a WHEELS shape
whose coral is the TYRE across the bottom of the wheel, so the obvious move
was to give the two wheel references a `coralSole` the way the four boots
have one. Rows were measured the way the floors were, on a foreground width
profile down the crop (value over 0.30) that shows where the narrow shaft
ends and the wide wheel begins: blue, wheel 1279 to its floor at 1368, 89
rows, block from 1338; orange, 1266 to 1367, 101 rows, from 1333; both 0.34
of the wheel, which is the bake's own CORAL_H_V3.wheels.

BOTH CUTS FAILED, and they failed in the two different ways this mechanism
can. The blue wheel's tyre is genuinely dark rubber, so the matting model
drops most of it: the pin caught 73 pixels at a gain of 3.67, which is no
block at all. The orange wheel's matte at those rows is not the wheel but a
RECTANGLE, the plinth's lit face that the model kept, so the pin painted a
pale pink rectangle hanging off the wheel and out into the plate. An adapter
fed that argues for a pink rectangle, which is worse than no reference. So
neither wheel carries a sole, and the wheels jobs take their coral from a
BOOT reference (whose block is clean and measured) and their rolling-foot
vocabulary from a wheel one. `coralSole` works where the shoe is light and
its matte is the shoe; it is not a general-purpose recolour.

Springs, sneakers and pegs need no new cut for the same reason: their coral
is a straight-topped block at the bottom of the part, which is exactly what
the four boot references already show.

--only takes a comma list, and a run on a subset MERGES its records into the
manifest on disk and rebuilds the contact sheet from the whole manifest, so
re-cutting four boots leaves every other reference's file and record as it
was. Before this, --only wrote a manifest holding one reference.

── LICENCE ────────────────────────────────────────────────────────────────
These are seedream_v5_pro outputs through Higgsfield, fed to an IP-Adapter at
inference. Nothing is trained on them. See bots-sd-stylecut.py's note before
anything ever is.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CONCEPT = os.path.join(ROOT, "art-src", "bots", "concept")
RAW = os.path.join(ROOT, "art-src", "sd", "style")
OUT = os.path.join(RAW, "clean")
MATRIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bots-sd-prompts.json")

CONTEXT = 0.10      # extra context round the raw box handed to the matting model
SQUARE_PAD = 0.08   # breathing room round the robot inside the square, per side
MIN_COVER = 0.06    # a matte covering less of its crop than this is not a robot
BASE_V = 0.34       # value under which a plinth row is dark wood, not clay (fallback trim only)
OUT_SIZE = 768      # every reference at one size; CLIP sees 224 of it
EXCLUDE = os.path.join(OUT, "_exclude")   # optional <name>.png masks, white = drop
HALO_PX = 3         # authored shelf parts: soft alpha further than this from a solid pixel is plinth, not part
SHELF_HEAD_FLOOR_Y = 1008                 # 6-shop.png: the seam where every shelf head meets its plinth
SHELF_TORSO_FLOOR_Y = 384                 # 6-shop.png: the seam under the teal and red torsos (see header)
SHELF_ARM_FLOOR_Y = 692                   # 6-shop.png: the arm row's plinth top (see header)
SHOP = "6-shop.png"
CORAL = (180, 109, 82)                    # #B46D52, the shoe coral bots-import-parts.py pins every leg to

# name -> {slot, goodFor, floorY (absolute source-pixel floor, before matting) | trimBase,
#          and for the authored shelf parts: source, box (absolute source px), clipX, excludePolys}
# Order is the contact sheet's order: whole robots, heads, torsos, arms, weapons, legs.
SET = {
    "bot-2":        {"slot": "bot", "goodFor": "whole robot, dead-on-ish, the biggest and cleanest figure "
                     "we own: proportions, the vinyl finish, the pastel palette, the brass key"},
    "bot-3":        {"slot": "bot", "goodFor": "whole robot in action with its hammer, three-quarter: "
                     "finish and the weapon prop; do not use for camera"},
    "bot-4":        {"slot": "bot", "goodFor": "whole robot front-on, arms up: proportions and the coral feet"},
    "head-2":       {"slot": "head", "goodFor": "the hero's head, ear cup to ear cup: the face at the "
                     "largest size we have (bezel, lit lens, grille, ear cups)"},
    "head-shelf01": {"slot": "head", "goodFor": "dead-on shelf head, olive with amber eyes: the face",
                     "floorY": SHELF_HEAD_FLOOR_Y},
    "head-shelf02": {"slot": "head", "goodFor": "dead-on shelf head, blue-grey with two-colour eyes: the face",
                     "floorY": SHELF_HEAD_FLOOR_Y},
    "head-shelf03": {"slot": "head", "goodFor": "dead-on shelf head, teal with yellow eyes and a smile "
                     "grille: the face, closest to the hero's palette", "floorY": SHELF_HEAD_FLOOR_Y},
    "head-shelf04": {"slot": "head", "goodFor": "dead-on shelf head, red with cyan eyes: the face",
                     "floorY": SHELF_HEAD_FLOOR_Y},
    "head-shelf05": {"slot": "head", "goodFor": "dead-on shelf head, white with orange and green eyes: the face",
                     "floorY": SHELF_HEAD_FLOOR_Y},

    # ── the torso row of 6-shop.png (top shelf, gold-banded plinths) ──────
    "torso-blue":   {"slot": "torso", "source": SHOP, "box": [250, 145, 548, 392], "floorY": 386, "clipX": True,
                     "excludePolys": [[(255, 372), (316, 372), (316, 448), (255, 448)],      # the price tag
                                      [(531, 368), (548, 368), (548, 394), (531, 394)]],     # lit plinth rim under the right cap
                     "goodFor": "blue torso, dead-on: the barrel, the brass key in its window, the red dome on "
                                "top, one round shoulder cap; its one hanging arm is cut off at the right edge "
                                "on purpose, and its price tag (which hangs above the floor) is cut by polygon. "
                                "Its shadowed lower-left corner mattes soft under every model we have (dark "
                                "blue on dark wood); prefer torso-teal"},
    "torso-teal":   {"slot": "torso", "source": SHOP, "box": [712, 198, 1034, 386], "floorY": SHELF_TORSO_FLOOR_Y,
                     "goodFor": "teal torso, the cleanest torso we own: the barrel, the key, a round shoulder "
                                "cap each side, no arms; closest to the hero's palette"},
    "torso-red":    {"slot": "torso", "source": SHOP, "box": [1203, 188, 1418, 386], "floorY": 383, "clipX": True,
                     "matteBox": [1070, 150, 1550, 420],
                     "goodFor": "red torso: the barrel and the key with the paint speckle; its two blue arms "
                                "are cut off at the shoulder balls on purpose"},
    "torso-cream":  {"slot": "torso", "source": SHOP, "box": [1585, 198, 1842, 392], "floorY": 386,
                     "excludePolys": [[(1804, 370), (1842, 370), (1842, 394), (1804, 394)]],
                     "goodFor": "cream and red two-tone torso: the barrel, the key, small shoulder caps; its "
                                "tag string, which runs beside the right cap, is cut by polygon"},

    # ── the arm row of 6-shop.png (purple-banded plinths). One limb each. ─
    "arm-claw-red":    {"slot": "arm", "source": SHOP, "box": [380, 588, 506, 692], "floorY": SHELF_ARM_FLOOR_Y,
                        "excludePolys": [[(370, 662), (416, 662), (416, 706), (370, 706)]],
                        "goodFor": "one stubby arm, dead-on: a chrome ball at the shoulder, red bands, "
                                   "a chrome three-finger claw at the hand; the plinth's lit rim left of the "
                                   "claw, which sits above the floor, is cut by polygon"},
    "arm-bent-teal":   {"slot": "arm", "source": SHOP, "box": [612, 550, 692, 686], "floorY": SHELF_ARM_FLOOR_Y,
                        "model": "u2net",
                        "goodFor": "one arm bent at the elbow like a 7: a chrome ball at each end, teal "
                                   "rings between; the elbow ball and the two-segment build"},
    "arm-elbow-white": {"slot": "arm", "source": SHOP, "box": [886, 570, 974, 686], "floorY": SHELF_ARM_FLOOR_Y,
                        "pair": "its mirror twin stands to its left (x 765-854) and is not cut: the rig mirrors",
                        "goodFor": "one white two-segment arm with a chrome elbow ball and a chrome cap at "
                                   "each end: the elbow and the soft white vinyl"},
    "arm-mitt-teal":   {"slot": "arm", "source": SHOP, "box": [994, 620, 1078, 690], "floorY": 690,
                        "goodFor": "a mitt alone, teal, fingers curled into a fist with an orange and blue "
                                   "cuff: what the hand end of an arm placeholder should become"},
    "arm-mitt-pale":   {"slot": "arm", "source": SHOP, "box": [1106, 620, 1208, 690], "floorY": 690,
                        "goodFor": "a mitt alone, pale teal with chrome knuckles: the hand end, lighter finish"},
    "arm-coral":       {"slot": "arm", "source": SHOP, "box": [1216, 560, 1354, 692], "floorY": SHELF_ARM_FLOOR_Y,
                        "clipX": True,
                        "goodFor": "one whole jointed arm, three-quarter: a big chrome ball at the shoulder, "
                                   "grey and teal joint bands, a coral forearm ending in a rounded cap; the "
                                   "best single teacher of arm proportions on the shelf. Mind that the "
                                   "shoulder ball holds a red lens in a chrome ring and can read as an eye"},
    "arm-teal-cuffs":  {"slot": "arm", "source": SHOP, "box": [1678, 542, 1836, 694], "floorY": 694, "clipX": True,
                        "goodFor": "one thick teal arm with red cuffs at both joints, a teal ball at the "
                                   "shoulder, ending in a chrome mitt: the cuff and the mitt"},
    "arm-white-cuff":  {"slot": "arm", "source": SHOP, "box": [1834, 566, 1942, 696], "floorY": 695, "clipX": True,
                        "excludePolys": [[(1893, 689), (1910, 689), (1910, 703), (1893, 703)]],
                        "goodFor": "one white arm, a red cuff at the elbow, a chrome mitt resting on the "
                                   "shelf: the cuff, the mitt, the white vinyl; the free tail of its tag "
                                   "string below the mitt is cut by polygon (where the string crosses the "
                                   "red cuff it stays: cutting it there would notch the cuff)"},
    "arm-hand-chrome": {"slot": "arm", "source": SHOP, "box": [1992, 566, 2104, 692], "floorY": SHELF_ARM_FLOOR_Y,
                        "goodFor": "a chrome hand alone with five jointed fingers on a red and blue wrist: "
                                   "chrome only; it is a hand, not a mitt, so use it last"},
    "arm-pincer-teal": {"slot": "arm", "source": SHOP, "box": [2262, 566, 2360, 692], "floorY": 690,
                        "goodFor": "a crab pincer alone on a teal cuff and a chrome ball: the claw hand"},
    "arm-pincer-red":  {"slot": "arm", "source": SHOP, "box": [2372, 560, 2490, 694], "floorY": 693,
                        "goodFor": "a crab pincer alone on a red cuff: the claw hand, warmer palette"},

    # ── the weapon rack of 6-shop.png (top shelf right, small plinths) ────
    "weapon-hammer":      {"slot": "weapon", "source": SHOP, "box": [1884, 290, 2012, 413], "floorY": 411,
                           "clipX": True, "model": "u2net",
                           "excludePolys": [[(1981, 397), (2006, 397), (2006, 424), (1981, 424)]],
                           "goodFor": "the toy hammer, side-on: a grey head with a band and a bolt, a coral "
                                      "handle; THE mallet reference. Its tag string, which loops off the "
                                      "handle's foot, is cut by polygon"},
    "weapon-wrench":      {"slot": "weapon", "source": SHOP, "box": [2008, 268, 2100, 413], "floorY": 411,
                           "clipX": True,
                           "goodFor": "the chrome wrench, dead-on: an open jaw and a ring at the handle's foot; "
                                      "its twin to the right is not cut"},
    "weapon-spring-claw": {"slot": "weapon", "source": SHOP, "box": [2213, 273, 2320, 409], "floorY": 408,
                           "clipX": True,
                           "goodFor": "a gold pincer on a chrome ball on a coil spring: a grabber prop"},
    "weapon-drill":       {"slot": "weapon", "source": SHOP, "box": [2318, 256, 2502, 404], "floorY": 403,
                           "excludePolys": [[(2382, 396), (2440, 396), (2440, 448), (2382, 448)]],
                           "goodFor": "the blue drill with its chrome bit: a prop with a round chrome boss that "
                                      "can read as an eye, so use it last; its price tag top sits above the "
                                      "floor and is cut by polygon"},

    # ── the foot row of 6-shop.png (silver-banded plinths). One boot each. ─
    "leg-boot-red":     {"slot": "leg", "source": SHOP, "box": [252, 1188, 354, 1366], "floorY": 1365, "clipX": True,
                         "coralSole": 1336,
                         "pair": "the LEFT boot of a pair; the right one wears the tag on its leg",
                         "goodFor": "one red boot, dead-on: a round red top, chrome ankle rings, a fat red "
                                    "toe cap and, from row 1336 down, ONE coral sole block pinned to the "
                                    "shoe coral (see the header); THE boot reference for the leg jobs"},
    "leg-boot-yellow":  {"slot": "leg", "source": SHOP, "box": [534, 1195, 626, 1371], "floorY": 1370, "clipX": True,
                         "coralSole": 1336,
                         "pair": "the LEFT boot of a pair; the tag hangs right of the right boot",
                         "goodFor": "one yellow and teal boot, dead-on: an ankle band, a two-tone toe and, "
                                    "from row 1336 down, ONE coral sole block pinned to the shoe coral; the "
                                    "classic boot, the second boot reference for the leg jobs"},
    "leg-boot-purple":  {"slot": "leg", "source": SHOP, "box": [823, 1214, 912, 1370], "floorY": 1369, "clipX": True,
                         "coralSole": 1340,
                         "pair": "the LEFT boot of a pair; the tag hangs from the right boot's top",
                         "goodFor": "one purple and yellow striped boot, dead-on: a chrome ankle, a striped "
                                    "toe cap and, from row 1340 down, ONE coral sole block pinned to the "
                                    "shoe coral"},
    "leg-toes-orange":  {"slot": "leg", "source": SHOP, "box": [1070, 1222, 1188, 1364], "floorY": 1362, "clipX": True,
                         "pair": "the LEFT foot of a pair; the tag hangs from the right foot's ankle",
                         "goodFor": "one orange and blue foot with three round toes and a chrome ankle "
                                    "ring: toes, for a foot that is not a boot"},
    "leg-boot-teal":    {"slot": "leg", "source": SHOP, "box": [1358, 1183, 1464, 1364], "floorY": 1363, "clipX": True,
                         "coralSole": 1337,
                         "pair": "the LEFT boot of a pair; the tag hangs right of the right boot",
                         "goodFor": "one tall teal boot with yellow bands and a chrome ankle ring, dead-on: "
                                    "the ankle band and the tall shaft, and from row 1337 down ONE coral "
                                    "sole block pinned to the shoe coral"},
    "leg-toes-coral":   {"slot": "leg", "source": SHOP, "box": [1698, 1183, 1784, 1377], "floorY": 1375, "clipX": True,
                         "model": "u2net",
                         "pair": "the LEFT foot of a pair; the tag hangs from the right foot's leg",
                         "goodFor": "one blue leg on a chrome ankle with two CORAL toes reaching forward and "
                                    "a yellow hub: the coral toes; the floor is set under the toes, not the "
                                    "sole, so they survive"},
    "leg-wheel-blue":   {"slot": "leg", "source": SHOP, "box": [1983, 1183, 2092, 1370], "floorY": 1368, "clipX": True,
                         "pair": "the LEFT wheel of a pair; the tag hangs under the right one",
                         "goodFor": "one chrome and blue wheel foot on a blue shaft: a rolling foot with a "
                                    "dark tyre and a chrome hub. NO coralSole: see THE CORAL TYRE in the "
                                    "header. Use it for the wheel VOCABULARY and a boot reference for the "
                                    "coral block"},
    "leg-wheel-orange": {"slot": "leg", "source": SHOP, "box": [2263, 1198, 2358, 1369], "floorY": 1367, "clipX": True,
                         "pair": "the LEFT wheel of a pair; the tag hangs under the right one",
                         "goodFor": "one orange wheel foot with a yellow cap and a chrome hub: a rolling "
                                    "foot, warm palette. NO coralSole: see THE CORAL TYRE in the header"},
}


def plate_rgb() -> tuple[int, int, int]:
    m = json.load(open(MATRIX, encoding="utf-8"))
    hx = m["plates"]["grey"]["hex"]
    return tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))


def rembg_session(model: str):
    try:
        from rembg import new_session
    except Exception as e:
        raise SystemExit(f"bots-sd-stylerefs REFUSES: rembg is not importable here ({e}); "
                         f"pip install rembg, or cut the references by hand")
    return new_session(model)


def matte(im: Image.Image, session) -> np.ndarray:
    from rembg import remove
    out = remove(im.convert("RGB"), session=session, only_mask=True)
    return np.asarray(out.convert("L")).astype(np.float64) / 255.0


def trim_base(a: np.ndarray, rgb: np.ndarray) -> tuple[np.ndarray, int]:
    """Drop the plinth: from the bottom up, rows whose kept pixels are mostly
    darker than BASE_V. Stops at the first row of clay. Returns (alpha, rows)."""
    v = rgb.max(axis=2) / 255.0
    keep = a > 0.5
    rows = np.where(keep.any(axis=1))[0]
    if rows.size == 0:
        return a, 0
    cut = 0
    y = int(rows[-1])
    while y > rows[0]:
        sel = keep[y]
        if sel.sum() < 4:
            y -= 1
            cut += 1
            continue
        dark = float((v[y][sel] < BASE_V).mean())
        if dark < 0.55:
            break
        y -= 1
        cut += 1
    if cut:
        a = a.copy()
        a[y + 1:, :] = 0.0
        # the plinth is wider than the head, so what is left of it beside the
        # chin is a thin dark shelf; take the largest component only
        lab, n = ndimage.label(a > 0.5)
        if n > 1:
            sizes = np.bincount(lab.ravel())[1:]
            a = np.where(lab == (int(sizes.argmax()) + 1), a, 0.0)
    return a, cut


def paint_sole(rgb: np.ndarray, a: np.ndarray, from_row: int) -> tuple[np.ndarray, dict]:
    """Pin every matte pixel from `from_row` (context-crop space) down to the
    shoe coral: all three channels scaled together, so hue and saturation are
    the coral's constants and the crop's own shading rides on value, with one
    gain that puts the block's median value at the coral's own (0.71). The
    same pin scripts/bots-import-parts.py applies to every shipped leg."""
    v = rgb.max(axis=2) / 255.0
    band = np.zeros(a.shape, bool)
    band[max(0, from_row):, :] = True
    sel = band & (a > 0.02)          # the soft edge too: square_on_plate blends it by alpha
    solid = band & (a > 0.5)
    if not solid.any():
        return rgb, {"row": from_row, "pixels": 0, "gain": None}
    ratio = np.array(CORAL, np.float64) / max(CORAL)
    target = max(CORAL) / 255.0
    gain = target / max(float(np.median(v[solid])), 1e-3)
    out = rgb.copy()
    # ONE block, not a band of the crop's own highlights and shadows in coral:
    # after the gain, the deviation from the target value is halved and the
    # result held between 0.30 and 0.85, so the block reads as one flat coral
    # (the first cut let the toe cap's highlights through at full gain and the
    # block came back a pale salmon, measured 2026-09-05)
    vv = np.clip(target + 0.5 * (v * gain - target), 0.30, 0.85)
    out[sel] = vv[sel][:, None] * 255.0 * ratio[None, :]
    return out, {"row": from_row, "pixels": int(solid.sum()), "gain": round(gain, 3),
                 "valueMedian": round(float(np.median(vv[solid])), 3)}


def square_on_plate(rgb: np.ndarray, a: np.ndarray, plate, size: int) -> tuple[Image.Image, Image.Image, dict]:
    keep = a > 0.5
    ys, xs = np.where(keep)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop_rgb = rgb[y0:y1, x0:x1]
    crop_a = a[y0:y1, x0:x1]
    h, w = crop_a.shape
    side = int(round(max(w, h) * (1 + 2 * SQUARE_PAD)))
    canvas = np.empty((side, side, 3), np.float64)
    canvas[...] = np.array(plate, np.float64)
    alpha = np.zeros((side, side), np.float64)
    ox, oy = (side - w) // 2, (side - h) // 2
    canvas[oy:oy + h, ox:ox + w] = (crop_rgb * crop_a[..., None] + canvas[oy:oy + h, ox:ox + w] * (1 - crop_a[..., None]))
    alpha[oy:oy + h, ox:ox + w] = crop_a
    img = Image.fromarray(np.clip(canvas + 0.5, 0, 255).astype(np.uint8), "RGB").resize((size, size), Image.LANCZOS)
    am = Image.fromarray(np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)
    return img, am, {"nativeBox": [int(x0), int(y0), int(x1), int(y1)], "nativeSide": int(side),
                     "robotPx": [int(w), int(h)]}


def raw_crop_for(idx: dict, source: str, box) -> tuple[str | None, float]:
    """The detected crop in index.json this authored box mostly sits inside:
    (name, share of the authored box it covers), or (None, 0)."""
    x0, y0, x1, y1 = box
    area = float(max(1, (x1 - x0) * (y1 - y0)))
    best, share = None, 0.0
    for r in idx.values():
        if r["source"] != source:
            continue
        rx0, ry0, rx1, ry1 = r["box"]
        ov = max(0, min(x1, rx1) - max(x0, rx0)) * max(0, min(y1, ry1) - max(y0, ry0))
        if ov / area > share:
            best, share = r["name"], ov / area
    return (best, round(share, 3)) if share >= 0.5 else (None, round(share, 3))


def polys_mask(polys, box, size) -> np.ndarray:
    """Authored exclusion polygons (source px) rasterised in context-crop space."""
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(x - box[0], y - box[1]) for x, y in poly], fill=255)
    return np.asarray(m) > 127


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="isnet-general-use", help="rembg model name")
    ap.add_argument("--only", default=None, help="one reference name, or a comma list; the run merges "
                                                 "into the manifest on disk (see the header)")
    args = ap.parse_args()
    only = {n.strip() for n in args.only.split(",") if n.strip()} if args.only else None

    idx_path = os.path.join(RAW, "index.json")
    if not os.path.exists(idx_path):
        raise SystemExit(f"bots-sd-stylerefs REFUSES: {idx_path} missing; run bots-sd-stylecut.py first")
    idx = {r["name"]: r for r in json.load(open(idx_path, encoding="utf-8"))["crops"]}
    plate = plate_rgb()
    sessions = {args.model: rembg_session(args.model)}   # one session per matting model, made on first use
    os.makedirs(OUT, exist_ok=True)

    recs, thumbs, bad = [], [], []
    for name, spec in SET.items():
        slot, good = spec["slot"], spec["goodFor"]
        floor_y, trim = spec.get("floorY"), spec.get("trimBase", False)
        if only and name not in only:
            continue
        if "b1" in name.lower():
            raise SystemExit(f"bots-sd-stylerefs REFUSES: {name} is the old anchor")
        if "box" in spec:
            # an authored shelf part: its own box, named for what it is
            source, raw_box = spec["source"], list(spec["box"])
            raw_name, raw_share = raw_crop_for(idx, source, raw_box)
            caption = idx[raw_name].get("caption", "") if raw_name else ""
        else:
            r = idx.get(name)
            if r is None:
                bad.append(f"{name}: not in {os.path.relpath(idx_path, ROOT)} (re-run bots-sd-stylecut.py)")
                continue
            source, raw_box, raw_name, raw_share, caption = r["source"], list(r["box"]), name, 1.0, r.get("caption", "")
        src = os.path.join(CONCEPT, source)
        im = Image.open(src).convert("RGB")
        W, H = im.size
        x0, y0, x1, y1 = raw_box
        dx, dy = int((x1 - x0) * CONTEXT), int((y1 - y0) * CONTEXT)
        box = (max(0, x0 - dx), max(0, y0 - dy), min(W, x1 + dx), min(H, y1 + dy))
        if spec.get("matteBox"):
            # a part that fills its own box has no edge for the matting model to
            # find (the red torso came back as its key window): show it the whole
            # object with what hangs off it, and let the clip take the rest away
            mx0, my0, mx1, my1 = spec["matteBox"]
            box = (max(0, min(box[0], mx0)), max(0, min(box[1], my0)), min(W, max(box[2], mx1)), min(H, max(box[3], my1)))
        crop = im.crop(box)
        rgb = np.asarray(crop).astype(np.float64)
        # the matting model sees the WHOLE context crop, plinth included: fed a
        # crop stopped at the seam it returned ragged part-heads (shelf02 came
        # back as two eyes and a grille, 2026-09-05), because a head cut off at
        # the chin is not a complete object to it. The floor is applied to the
        # matte afterwards instead.
        model = spec.get("model", args.model)
        if model not in sessions:
            sessions[model] = rembg_session(model)
        a = matte(crop, sessions[model])
        if floor_y is not None:
            fy = int(floor_y) - box[1]
            if 0 < fy < a.shape[0]:
                a[fy:, :] = 0.0
            y1 = min(y1, int(floor_y))
        clipped = None
        if spec.get("clipX"):
            # the twin boot, the hanging arm, the next hammer head: stop at the box edge
            cx0, cx1 = x0 - box[0], x1 - box[0]
            before = a > 0.5
            a[:, :cx0] = 0.0
            a[:, cx1:] = 0.0
            clipped = int((before & ~(a > 0.5)).sum())
        excluded, exclude_note = None, None
        ex_path = os.path.join(EXCLUDE, name + ".png")
        if os.path.exists(ex_path):
            ex = Image.open(ex_path).convert("L")
            if ex.size != crop.size:
                ex = ex.resize(crop.size, Image.NEAREST)
            drop = np.asarray(ex) > 127
            excluded = int((drop & (a > 0.5)).sum())
            a = np.where(drop, 0.0, a)
            note_path = os.path.splitext(ex_path)[0] + ".txt"
            if os.path.exists(note_path):
                exclude_note = open(note_path, encoding="utf-8").read().strip()
        if spec.get("excludePolys"):
            drop = polys_mask(spec["excludePolys"], box, crop.size)
            excluded = (excluded or 0) + int((drop & (a > 0.5)).sum())
            a = np.where(drop, 0.0, a)
            exclude_note = (f"hand polygon(s) in source px, white = drop: {spec['excludePolys']}; "
                            f"the price tag that hangs above this reference's floor")
        # the matting model is asked about the whole padded crop; keep only what
        # touches the raw box, so a neighbour on the shelf does not ride along
        inner = np.zeros_like(a, bool)
        inner[y0 - box[1]:y1 - box[1], x0 - box[0]:x1 - box[0]] = True
        lab, n = ndimage.label(a > 0.5)
        if n > 1:
            keepl = {int(l) for l in np.unique(lab[inner & (lab > 0)])}
            sizes = np.bincount(lab.ravel())
            keepl = {l for l in keepl if sizes[l] >= 0.02 * sizes[1:].max()}
            a = np.where(np.isin(lab, list(keepl)), a, 0.0)
        cut_rows = 0
        if trim:
            a, cut_rows = trim_base(a, rgb)
        halo = None
        if "box" in spec:
            # the matting model returns soft alpha (0.1 to 0.4) over the lit
            # plinth rim beside a mitt; it never crosses 0.5, so no cut above
            # sees it, but composited on the plate it is a faint light smear.
            # Keep soft alpha only within HALO_PX of a solid pixel: the part's
            # own soft edge stays, the rim beside it goes. Authored parts only;
            # the head and bot references' outputs are unchanged.
            solid = a > 0.5
            near = ndimage.binary_dilation(solid, iterations=HALO_PX)
            halo = int(((a > 0.02) & ~near).sum())
            a = np.where(near, a, 0.0)
        cover = float((a > 0.5).mean())
        if cover < MIN_COVER:
            bad.append(f"{name}: the matte covers {cover:.1%} of its crop; that is not a robot "
                       f"(a wall cuts to nothing). Fix the box in bots-sd-stylecut.py")
            continue
        sole = None
        if spec.get("coralSole"):
            # the boot references: one coral sole block from the authored row
            # to the floor, pinned the way the importer pins every shipped leg
            rgb, sole = paint_sole(rgb, a, int(spec["coralSole"]) - box[1])
            sole = {"sourceRow": int(spec["coralSole"]), **sole}   # `row` is the same line in context-crop space
        img, am, geo = square_on_plate(rgb, a, plate, OUT_SIZE)
        img.save(os.path.join(OUT, name + ".png"))
        am.save(os.path.join(OUT, name + ".alpha.png"))
        rec = {"name": name, "file": f"art-src/sd/style/clean/{name}.png", "slot": slot,
               "sourceScene": source, "sourceBox": raw_box, "contextBox": list(box),
               "rawCrop": raw_name, "rawCropShare": raw_share, "authoredBox": "box" in spec,
               "floorY": floor_y, "clipX": bool(spec.get("clipX")), "clippedPx": clipped,
               "excludedPx": excluded, "excludeNote": exclude_note, "pair": spec.get("pair"),
               "haloPxDropped": halo, "matting": model, "matteBox": spec.get("matteBox"),
               "coralSole": sole,
               "matteCover": round(cover, 4), "plinthRowsCut": cut_rows,
               "robotNativePx": geo["robotPx"], "size": [OUT_SIZE, OUT_SIZE], "square": True,
               "plateHex": "#%02x%02x%02x" % plate, "goodFor": good,
               "caption": caption}
        recs.append(rec)
        t = img.copy()
        t.thumbnail((236, 236))
        thumbs.append((name, slot, geo["robotPx"], t))
        print(f"  {name:<20} {slot:<6} part {geo['robotPx'][0]:>4}x{geo['robotPx'][1]:<4} native  "
              f"matte {cover:5.1%}  floor {floor_y or '-':<5} clipped {clipped if clipped is not None else '-':<6} "
              f"excluded {excluded if excluded is not None else '-'}"
              + (f"  coral sole from row {sole['row'] + box[1]}: {sole['pixels']} px, gain {sole['gain']}" if sole else ""))

    if bad:
        for b in bad:
            print("  REFUSED " + b)
    if not recs:
        raise SystemExit("bots-sd-stylerefs: nothing written")

    if only:
        # a subset run: merge into the manifest on disk and rebuild the contact
        # sheet from the whole set, in the SET's order, so nothing outside the
        # subset changes its record or drops off the sheet
        prev_path = os.path.join(OUT, "manifest.json")
        prev = json.load(open(prev_path, encoding="utf-8"))["references"] if os.path.exists(prev_path) else []
        n_fresh = len(recs)
        fresh = {r["name"]: r for r in recs}
        merged = [fresh.pop(r["name"], r) for r in prev] + list(fresh.values())
        order = {n: i for i, n in enumerate(SET)}
        merged.sort(key=lambda r: order.get(r["name"], len(order)))
        recs = merged
        thumbs = []
        for r in recs:
            t = Image.open(os.path.join(OUT, r["name"] + ".png")).convert("RGB")
            t.thumbnail((236, 236))
            thumbs.append((r["name"], r["slot"], r["robotNativePx"], t))
        print(f"  merged {n_fresh} fresh record(s) into the manifest's {len(prev)}")

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"_": "The IP-Adapter style set: the part alone on the matrix's grey plate, square, "
                        "backgrounds removed by rembg. Whole robots carry proportions and finish; heads "
                        "carry the face; torsos carry the barrel and the key; arms carry the jointed limb, "
                        "the elbow ball, the cuff and the mitt or claw; legs carry the boot, the sole, the "
                        "ankle band and the coral toes; weapons carry the prop. Every pair on the shelf is "
                        "cut to ONE limb (the rig mirrors). Nothing named b1 belongs here: the concept art "
                        "is the law. The four boot references carry ONE coral sole block pinned to the shoe "
                        "coral from their authored `coralSole` row down (lane B, 2026-09-05; see the header), "
                        "so the adapter argues for the sole the v2 leg ruler draws.",
                   "plateHex": "#%02x%02x%02x" % plate, "size": OUT_SIZE, "matting": args.model,
                   "matting_": "the default model; a reference that names its own carries it in `matting` "
                               "(u2net keeps the coral hammer handle, the dark blue leg and the dark teal "
                               "arm segments that isnet drops; see the header)",
                   "floors": {"head": SHELF_HEAD_FLOOR_Y, "torso": SHELF_TORSO_FLOOR_Y, "arm": SHELF_ARM_FLOOR_Y,
                              "leg": "per reference (the toes come forward)", "weapon": "per reference"},
                   "references": recs}, f, indent=1)
    cols = 6
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 250, rows * 270), (18, 18, 22))
    d = ImageDraw.Draw(sheet)
    for i, (n, s, px, t) in enumerate(thumbs):
        r, c = divmod(i, cols)
        sheet.paste(t, (c * 250 + (250 - t.width) // 2, r * 270 + 6))
        d.text((c * 250 + 8, r * 270 + 246), f"{n}  {s}  {px[0]}x{px[1]}", fill=(255, 220, 120))
    sheet.save(os.path.join(OUT, "_contact.jpg"), quality=90)
    print(f"\n{len(recs)} clean references written to {os.path.relpath(OUT, ROOT)} "
          f"(+ manifest.json, _contact.jpg)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
