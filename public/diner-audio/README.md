# Domain Kitchen soundtrack

User-selected recordings supplied September 21, 2026:

| Scene | Recording | Original Suno ID | Game asset |
| --- | --- | --- | --- |
| Restaurant | Café Swing | 0bf5130a-b328-4d21-88c2-a5637540001f | cafe-swing-v1.mp3 |
| Food truck | Sunlit Groove | 66317690-107f-4eb5-a76f-6b44d6daa652 | sunlit-groove-v1.mp3 |

Both originals identify the creator as `sdmikecfc` and include an instrumental lyric tag. The owner supplied them after confirming their Suno Pro account was ready. Original downloads remain in the owner's `public` directory; subscription records are held by the owner rather than this repository.

Game copies contain audio only, stereo 44.1 kHz VBR MP3. Fixed gain adjustments of -2.23 dB and -2.43 dB respectively target approximately -18 LUFS from measured source loudness, without dynamic compression. Trailing silence is removed at 118.865 and 147.531 seconds. No tempo or pitch changes. Original files are unmodified.

Playback uses these complete mixes, not extracted stems. Two-second end/start crossfades soften repeats; short scene crossfades switch between restaurant and truck. No BPM is assumed from a generation prompt. This is crossfaded playback, not a claim of a musically seamless beat-matched edit. Existing separate volume controls and synth fallback remain available.

## Shuffled playlists — September 25, 2026

The restaurant now uses **Café Swing** and **Luz nas Mesas**. The truck uses **Sunlit Groove**, **Lunchtime Groove** and **Food Truck Adventure**. No further recordings are included.

| New supplied recording | Game asset | Playable seconds | Fixed gain |
| --- | --- | ---: | ---: |
| Lunchtime Groove | lunchtime-groove-v1.mp3 | 237.849 | -3.2 dB |
| Food Truck Adventure | food-truck-adventure-v1.mp3 | 238.515 | -3.2 dB |
| Luz nas Mesas | luz-nas-mesas-v1.mp3 | 239.960 | -2.0 dB |

Processed in `D:\Temp\domain-kitchen-playlist-20260925`, then added to the source's public soundtrack directory. These game copies strip cover images and metadata, use stereo 44.1 kHz VBR MP3, and measure -18.0 LUFS each. End silence was trimmed from the two truck additions; no tempo, pitch or dynamic compression was applied. The supplied originals remain unchanged.

Manifest version two contains separate shuffled bags. Each song plays once before reshuffling, avoiding immediate repeats across bag boundaries. Per-kitchen last-played history in local browser storage prevents the next session from starting with its previous last song; unavailable storage still permits session-local shuffling. Restaurant and truck history are independent. Preparation, service intensity, ordinary clicks, muting and hiding the tab do not select a new song.

Songs transition with two-second crossfades; kitchen changes retain the existing short crossfade. The next recording loads near the end of the current song. Decoded caching retains the current and upcoming recordings, rather than all five four-minute mixes. Slow downloads temporarily continue the current recording; unavailable songs are skipped for the session. Version-one recordings/stems and the original fallback remain supported.

Verification: 34 deterministic music integration groups, including shuffle coverage across 100 seeds, reload history, actual crossfade timing, delayed downloads, audio lifecycle races and click regression checks; 48 production-host routing cases; full-file decoding and loudness measurement for all three new game assets. Long listening and physical-phone performance are separate from these checks.

The `reference` directory and ZIP contain the older original synthesized melody reference, not the selected soundtrack recordings.
