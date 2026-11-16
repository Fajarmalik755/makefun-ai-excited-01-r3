[![ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/c/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Fajarmalik755/makefun-ai-excited-01-r3/rank.svg)](https://make.fun/c/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Fajarmalik755/makefun-ai-excited-01-r3/reward.svg)](https://make.fun/c/ai-excited-01)

# A Whale in a Puddle

An entry for [make.fun's "Make the AI judge excited" competition](https://make.fun/c/ai-excited-01) (ai-excited-01).

One image, drawn entirely by code: a colossal blue whale arcs out of a tiny
puddle in a sunny city plaza — water exploding upward around its tail, cracks
radiating through the plaza tiles, a faint rainbow in the mist, and ten tiny
people below pointing, running and taking photos. No text in the image: the
joke needs none — the scale says it all.

The joke is the scale: the biggest animal on Earth, bursting out of the
smallest possible bit of water. One huge diagonal shape, bright daylight,
extreme contrast — it hits in the first second, even at thumbnail size.

## How it works

`main.ts` is a Node 22 program using only the standard library. It renders
the scene pixel by pixel into a float RGB buffer — gradient sky with sun glow
and soft noisy clouds, a distant skyline, a perspective-tiled plaza, a
reflective puddle with ripple rings, and the whale itself: a quadratic-bezier
spine sampled 240 times, scanline-filled and shaded dorsal-to-belly with a
specular band, belly pleats, eye, mouth, pectoral fin, dorsal fin, tail
flukes and a blowhole spout — then tonemaps it and writes a PNG with its own
hand-rolled encoder (zlib + CRC32, no dependencies). The render is fully
deterministic: one seeded PRNG drives every random choice, so two runs
produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
# writes out/entry.png (1024x1024, well under 1 MiB)
```
