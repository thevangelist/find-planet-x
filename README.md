# Planet X · Mars Hill 1929

A browser game about Clyde Tombaugh's search for Pluto. Vanilla HTML/JS, no build step.

## Run

    ./serve.sh            # http://localhost:8765

Audio needs an http server (fetch does not work from file://). Images and the game itself also work
straight from index.html, just silently.

## Rhythm

He sleeps by day. Each day starts at 13:00 in the quarters. "To the observatory" goes to whatever is next:
darkroom if plates wait, comparator if pairs wait, the dome when it is dark, clear and moonless. Coffee, food,
writing and sleep are the only other things. A location bar (Quarters, Darkroom, Comparator, Dome, Logbook,
Status) and a process strip (Expose, Label, Develop, Blink, Check, Order) stay on screen. Energy runs out
after a long night plus a long session; at zero he falls asleep where he sits and the plate is lost.
Order slips when plates go unlabelled, pairs pile up unexamined, suspects stay unchecked or nothing is
written for ten days; in chaos plates get lost. The logbook is an A6 notebook with pages, pencil sketches
and the plate log in the order things were written. Weather follows Flagstaff's seasons.

## Controls

- Intro: space, click or → to continue, ← to go back
- Dome: first-person view of the night sky from Mars Hill (Three.js). Drag to turn the telescope, wheel
  zooms, arrows nudge, Enter or "Expose here" starts the exposure. "Flat chart" switches to the
  equatorial chart. Hours 21:00 to 03:00. During the exposure the arrow keys keep the guide star between
  the cross-wires, Esc aborts. Then write the plate label (RA, Dec) by hand.
- Comparator: no automatic blinking. ← → show plate A or B, space flips. W A S D or right-drag moves.
  Left-drag draws a pencil ring that marks a suspect. P swaps pencil and hand, N negative view
- M mutes

## Structure

- `js/sky.js` plate pairs: 432 × 356 mm, 123"/mm, ~85,000 stars, bright Delta Geminorum stars at real
  coordinates, Pluto at mag 15.1 shifting ~3.3 mm / 6 days at opposition
- `js/astro.js` dates, moon, weather, ecliptic regions relative to opposition
- `js/dome3d.js` first-person sky with the dome, pines and plate frame; `js/skymap.js` flat chart with real bright stars (`js/stars.js`, HYG catalogue, V ≤ 5.2), ecliptic, sun, moon
- `js/finds.js` Tombaugh's real asteroid, comet and variable-star discoveries by region and date
- `js/blink.js` comparator, `js/expose.js` exposure, `js/game.js` day loop and save
- `js/text.js` narration
- `assets/audio/` CC0 sounds, see CREDITS.md. amb_search and amb_discovery are synthesized in code.

Save state lives in localStorage. Plates record where the telescope really pointed and what was written on
the sleeve. Only labels pair plates (same field within 4°, 1 to 14 nights apart); the sky on the plate comes
from the real pointing, so a mislabelled plate pairs with the wrong field. Unlabelled plates can be labelled
from memory in the logbook. Pluto is on any plate covering RA 7h 16m, Dec +22°, with motion scaled by the
distance from opposition. A third plate of the same field is needed to check a suspect.
