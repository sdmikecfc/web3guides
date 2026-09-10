# Model Kombat trailer delivery

The 35-second master, 15-second vertical edit and poster are ready. The website loads the lighter 9.6 MB video only after Watch trailer is selected. Reopening and closing the player stops and releases the previous video.

- Master: [35-second 1080p trailer](https://d2ol7oe51mr4n9.cloudfront.net/user_3GpJFEywLomryuYxxmZmuYhsCXr/40b9c687-2817-4c4c-a083-a6f61e9bc767.mp4)
- Vertical: [15-second 1080×1920 cut](https://d2ol7oe51mr4n9.cloudfront.net/user_3GpJFEywLomryuYxxmZmuYhsCXr/70159a09-22bf-4243-8c8a-7ed9bd8fc768.mp4)
- Poster: [game poster](https://d2ol7oe51mr4n9.cloudfront.net/user_3GpJFEywLomryuYxxmZmuYhsCXr/affa1fcf-571b-4adc-b8e3-1088447dc797.png)
- Editing files: [native Higgsedit project with source media](https://d2ol7oe51mr4n9.cloudfront.net/user_3GpJFEywLomryuYxxmZmuYhsCXr/7ea77bc5-1742-438c-94e8-c55675bc19ef.zip)
- Local delivery folder: C:\Users\Mike\Documents\Codex\2026-09-07\i-b\outputs\model-kombat-trailer

Four reference-driven Seedance 2.5 shots were used. Two generated impacts were rejected for unclear damage/contact or altered grip. The final fight block is actual seed-75 footage, in damage order. The opening impact uses 0.38× presentation speed followed by a held camera orbit; simulation and damage geometry were unchanged. Dents remain subtle at normal fight distance; reactions and arm damage are clearer.

Cost: **270 of the 450-credit maximum**, including both rejected attempts. Account balance changed from 459.85 to 189.85. No further paid generations were made.

'Titan' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au

Music source: https://www.scottbuckley.com.au/library/titan/
License: https://creativecommons.org/licenses/by/4.0/
The music was excerpted, faded and mixed with generated mechanical cues and original synthesized impact accents. No narration.

## Verification
- Master: exactly 1,050 decoded H.264 frames,1920×1080,30fps,35.000s; stereo 48 kHz AAC.
- Vertical: exactly 450 decoded H.264 frames,1080×1920,30fps,15.000s; stereo 48 kHz AAC.
- Website copy: 9,608,593 bytes; measured -15.2 LUFS and -1.0 dBFS true peak; no unintended black interval detected at 0.15s threshold. Browser duration 35.008s reflects AAC padding within one video frame.
- Desktop 1280×720,phone 390×844,and short landscape844×390 player checks passed. Three successive desktop open/close cycles plus both other sizes verified on-demand requests, playable media, Escape and resource cleanup. No page errors.
- Final TypeScript check passed. The optimized Next production build passed before the final capture/player/short-height changes; these final changes also compiled and ran in the preview.
- Short-landscape shop verification passed: six first-row prices clear navigation by more than 15px, correct hit tests, Enter/Escape and focus restoration. Native Tab cycling can focus browser chrome; underlying page controls did not receive focus.
- Reduced-motion room telemetry stopped both room render loops. That headless run used SwiftShader software rendering, not a physical phone.

## Limits and rollout
The room visuals remain fixed-camera projected backgrounds with real 3D robots, stands and shared shadows. Full Blender room export and technical audits, physical-mobile FPS, live signed-wallet enrollment and a shared-database rollout remain open. This is a local preview, not a production deployment.

Doma Reporter code, configuration, services and live data were untouched. Trading, LP and arbitrage bots were untouched. The onboarding SQL is staged only and proposes replacing shared bb_coin_balance(text); neither it nor the shared bb_grant prerequisite may be applied without the separately explained permission and dependency review in onboarding-v2-migration.md.

## Discord preview post (not sent)
> Model Kombat has a clearer start. Use 250 starter coins to choose seven parts, name your robot and finish your build. Finished parts stay with that robot.
>
> Meet your crew in the five-stand garage. Browse the compact shop, compare parts and watch recent fights in Community.
>
> The new trailer is ready too. Open Watch trailer on the welcome screen.
>
> This is a preview, and we're still testing. Tell us where you get stuck and which robot is your favourite.
>
> Preview link: add the reviewed preview URL before posting.
