import io

P = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad\build_promo3.py"
s = io.open(P, encoding="utf-8").read()

# mech plates gain an optional war-cry line (layered over the slideshow)
a = '''def mech_plate(key, W, H):
    out = os.path.join(SP, f"_mech_{key}_{W}.png")'''
b = '''def mech_plate(key, W, H, cry=None):
    out = os.path.join(SP, f"_mech_{key}_{W}.png")'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''    spaced(d, int(H * 0.07), "PICK YOUR MECH", font(int(m * 0.030)), AMBER, int(m * 0.012), W / 2)
    spaced(d, int(H * 0.83), key.upper(), font(int(m * 0.055)), INK, int(m * 0.01), W / 2)'''
b = '''    spaced(d, int(H * 0.07), "PICK YOUR MECH", font(int(m * 0.030)), AMBER, int(m * 0.012), W / 2)
    if cry:
        spaced(d, int(H * 0.16), cry, font(int(m * 0.052)), INK, int(m * 0.006), W / 2)
    spaced(d, int(H * 0.83), key.upper(), font(int(m * 0.055)), INK, int(m * 0.01), W / 2)'''
assert s.count(a) == 1
s = s.replace(a, b)

# v4 running order: cockpit power-on opens with the title, the flyover moves
# under OWN A PIECE FROM $5, the war cry rides the mech slideshow, Vega
# closes with TAKE IT BACK + the address.
a = '''    # 1. war cry over the flyover
    seg_video(os.path.join(SP, "flyover.mp4"), 2.4, W, H,
              text_overlay(W, H, "THE MACHINES TOOK THE GRID", eyebrow="SEASON 6 · UPRISING"), S("cry1"))
    seg_video(os.path.join(SP, "flyover.mp4"), 2.0, W, H,
              text_overlay(W, H, "TAKE IT BACK"), S("cry2"), ss=2.5)
    # 2. the real market: Doma page pan'''
b = '''    # 1. the cockpit power-on: dark, engine ignites, lights kick on, first
    #    steps - the title lands as it starts walking (native engine audio)
    seg_video(os.path.join(SP, "ignition.mp4"), 5.2, W, H, None, S("ign1"), keep_audio=True)
    seg_video(os.path.join(SP, "ignition.mp4"), 2.8, W, H,
              text_overlay(W, H, "LAUNCH WARS", sub="SEASON 6 · UPRISING", y_frac=0.34), S("ign2"), ss=5.2, keep_audio=True)
    # 2. the real market: Doma page pan'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''    # 3. the live war map
    seg_still(os.path.join(SP, "scr_front.png"), 3.4, W, H,
              text_overlay(W, H, "OWN A PIECE FROM $5", sub="A LIVE WAR MAP OF EVERY LAUNCH", y_frac=0.68), S("map"))'''
b = '''    # 3. the live war: the FLYOVER (Mike: the zoom map replaces the screenshot here)
    seg_video(os.path.join(SP, "flyover.mp4"), 3.6, W, H,
              text_overlay(W, H, "OWN A PIECE FROM $5", sub="A LIVE WAR MAP OF EVERY LAUNCH", y_frac=0.68), S("map"))'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''    # 6. four mech slams
    for k in SLAMS:
        plate = mech_plate(k, W, H)'''
b = '''    # 6. the mech slideshow carries the war cry
    for k in SLAMS:
        plate = mech_plate(k, W, H, cry="THE MACHINES TOOK THE GRID")'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''    # 7. end card
    seg_still(endcard(W, H), 4.0, W, H, None, S("end"), fade_in=True)'''
b = '''    # 7. Vega closes it: TAKE IT BACK + the address (she IS the end card)
    VEGA = "C:/Users/Mike/Desktop/web3guides/public/s6-art/pilot/anim/vega.mp4"
    seg_video(VEGA, 4.0, W, H,
              text_overlay(W, H, "TAKE IT BACK", sub="LAUNCHWARS.XYZ", y_frac=0.62), S("vega"))'''
assert s.count(a) == 1
s = s.replace(a, b)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("v4 running order in place")
