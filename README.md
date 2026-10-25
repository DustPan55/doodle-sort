# Doodle Sort

A shape-sorter toy for little kids, built as a web app and hosted on GitHub Pages. It's a sibling of
[Doodle Pop](https://github.com/DustPan55/doodle-pop).

- **Drag each shape into its hole.** It snaps in when it's dropped close enough, plays a chime and says its name. A shape dropped anywhere else slides back.
- **Fill every hole** for a celebration, then a new round with new shapes.
- **Hints:** after 8 seconds without a touch, the next shape wiggles and its hole pulses.
- **Each finger drags its own shape.** A thumb resting on empty space does nothing.

## Grown-up menu

Press and hold the lock in the top-right corner for 1.5 s. It has:

- **Level 1–6:** the number of shapes. Levels 1–2 use circle, square and triangle; star and heart join at 3–4; hexagon and diamond at 5–6. The snap distance gets a little tighter as levels go up.
- **Level up by itself** after 3 completed rounds (off by default).
- Sound, voice, theme (Auto/Light/Dark), the all-time sorted count, New shapes and Reset counter.

## Locking the phone to the app

Web pages and native apps can't stop a child from leaving. iOS **Guided Access** can:
Settings → Accessibility → Guided Access → On. Then open the app and triple-click the side button.
The app's start screen walks parents through this.

## Development

No build step. Run `python3 -m http.server` in this folder and open http://localhost:8000.

Pushing to `main` deploys to GitHub Pages. **Run `./bump.sh <version>`** (e.g. `./bump.sh 1.1.0`) whenever you change a file;
it sets the version shown in the grown-up menu and the offline cache name. Without it,
phones that already installed the app keep the old cached copy.
