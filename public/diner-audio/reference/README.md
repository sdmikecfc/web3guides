# Domain Kitchen — original music reference

These are exports of the game's original synthesized sketch, not finished Suno tracks.

- `diner-original-reference.wav`: melody and bass, with no ambience or gameplay sounds.
- `diner-melody-only.wav`: isolated melody, useful as an audio reference.
- `diner-melody.mid`: the same melody as MIDI, in 3/4 at 136.36 BPM.

The WAVs contain two 10.56-second phrases plus a two-second tail (23.12 seconds), mono 48 kHz / 16-bit PCM, peak approximately -3 dBFS. The source advances one note every 0.44 seconds. Melody notes begin C5, E5, G5, E5, D5, B4. Its tonal centre is C major; the simple bass moves through C, F and G. This is a reference phrase rather than a production loop.

For the finished score, use a 136 BPM grid with a relaxed 68 BPM half-time feel. Keep the melody's identity but allow new phrasing and harmony in 4/4. Generate instrumentals using your own paid Suno account, and download selected tracks through Suno's official download channel while subscribed. Keep the original downloads, track IDs and subscription/download records alongside the final asset record. Do not use another creator's remix as this game's source.

## Restaurant — Open for Lunch

Instrumental background score for a charming neighbourhood burger café. Use the uploaded original melody as a recognizable recurring motif, with fresh phrasing and warm extended chords. 136 BPM with a relaxed 68 BPM half-time feel, gentle swing. Intimate electric piano, soft plucked guitar, rounded melodic bass, brushed drums and restrained shaker. Begin simply, introduce bass, gradually add light percussion, open into a quietly uplifting middle section, then return naturally to the opening texture. Memorable, affectionate and understated, with space between melodic phrases. Clean warm production, approximately two minutes. Instrumental only, no vocal chops, cinematic impacts, dramatic drops or showy solos.

## Food truck — Round the Block

Instrumental cooking-adventure score sharing the uploaded café melody's musical identity. 136 BPM, relaxed half-time groove with a little more forward motion. Playful muted guitar, warm electric piano, rounded bass, soft rim-click drums and light hand percussion. A small memorable motif moves between instruments. Build gradually into a confident, sunny travelling section, add a restrained countermelody, then breathe back into a lighter passage. Energetic enough to make cooking satisfying, spacious enough to hear gameplay cues. Approximately two minutes, steady tempo, recurring sections suitable for looping. No vocals, alarm-like sounds, orchestral bombast, big drops or abrupt ending.

## Finishing checklist

1. Generate several candidates for each theme with Instrumental enabled. Preserve the memorable motif; choose the performance that remains pleasant after repeated listening.
2. Export the selected full mixes and stems from each same performance. Do not combine independently generated bass/drums and expect synchronization.
3. Edit a stable repeated musical region, align every stem to exactly the same loop start/end, and preserve reverb tails. Reject audible extraction artifacts; use a full mix if stem separation is unsuitable.
4. Keep lossless masters. Export playback files into `/diner-audio/` and register them in `manifest.json`. Each track declares bpm, beatsPerBar, loopStart, loopEnd and layers (`harmony` required, `bass`, `percussion`, `lift` optional). A full mix uses only `harmony`.
5. Verify ten continuous loops, home/truck transitions, mute/unmute, background/resume, phone speakers and audible gameplay cues.

The shipped manifest intentionally has no finished tracks until the Suno selections are supplied. The original synth remains the playable fallback; it is not presented as a generated soundtrack.
