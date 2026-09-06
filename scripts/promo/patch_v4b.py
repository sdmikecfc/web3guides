import io

P = r"C:\Users\Mike\AppData\Local\Temp\claude\C--Users-Mike-Desktop-trading-bot--claude-worktrees-clever-clarke-50cbb4\447c6f2b-c4f9-4db6-af73-7917a13a8086\scratchpad\build_promo3.py"
s = io.open(P, encoding="utf-8").read()

# Mike 2026-08-17: "'Own a piece from $5' -> 'Play for just $5', make it the
# one-second scene, and the original 2nd scene (the Doma pan) goes right
# before the games." New order: ignition -> $5 flash -> board -> Doma -> games.
a = '''    # 2. the real market: Doma page pan
    seg_still(os.path.join(SP, "scr_doma_full.png"), 4.0, W, H,
              text_overlay(W, H, "BUY REAL DOMAINS", sub="LIVE ON DOMA", y_frac=0.68), S("doma"), pan_full_page=True)
    # 3. the live war: the FLYOVER (Mike: the zoom map replaces the screenshot here)
    seg_video(os.path.join(SP, "flyover.mp4"), 3.6, W, H,
              text_overlay(W, H, "OWN A PIECE FROM $5", sub="A LIVE WAR MAP OF EVERY LAUNCH", y_frac=0.68), S("map"))
    # 4. the money: war board
    seg_still(os.path.join(SP, "scr_board.png"), 3.4, W, H,
              text_overlay(W, H, "EARN REAL MONEY", sub="$1,000 SEASON POOL · PAID BY PERCENT BONDED", y_frac=0.68), S("board"))
    # 5. arcade: one intro card + four QUICK cuts'''
b = '''    # 2. the $5 flash: one second of the flyover, one line
    seg_video(os.path.join(SP, "flyover.mp4"), 1.2, W, H,
              text_overlay(W, H, "PLAY FOR JUST $5", y_frac=0.68), S("map"))
    # 3. the money: war board
    seg_still(os.path.join(SP, "scr_board.png"), 3.4, W, H,
              text_overlay(W, H, "EARN REAL MONEY", sub="$1,000 SEASON POOL · PAID BY PERCENT BONDED", y_frac=0.68), S("board"))
    # 4. the real market: Doma page pan, right before the games
    seg_still(os.path.join(SP, "scr_doma_full.png"), 4.0, W, H,
              text_overlay(W, H, "BUY REAL DOMAINS", sub="LIVE ON DOMA", y_frac=0.68), S("doma"), pan_full_page=True)
    # 5. arcade: one intro card + four QUICK cuts'''
assert s.count(a) == 1
s = s.replace(a, b)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("v4b: $5 flash at 1.2s, Doma pan moved before the games")
