# Banner fonts

Two self-hosted fonts back the home hero banner text (see the `@font-face` rules
in `src/index.css`).

## `ubuntu-bold-italic.woff2`

Ubuntu Bold Italic — the exact font of the welcome quote in the source PSD
(`RobotechyBitcoinBannerImage.psd`). Ubuntu ships under the **Ubuntu Font
Licence 1.0**, which permits redistribution, so the full face is shipped.

## `avengeance-isaac-weeks.woff2`

Avengeance Heroic Avenger _Italic_ — the exact green display font used for the
"ISAAC WEEKS" by-line in the source PSD.

**This is a commercial / licensed font (Iconian Fonts).** Ben holds a licence,
but to avoid redistributing a usable copy of the font in this public repo, the
file shipped here is **subset to only the glyphs needed for the fixed string
"ISAAC WEEKS"** — the letters `I S A C W E K` plus a space (9 glyphs, ~0.9 KB).
It cannot set any other text.

Regenerate from the licensed source `.ttf` (kept out of the repo) with:

```sh
pyftsubset "AVENGEANCE HEROIC AVENGER AT.ttf" \
  --text="ISAAC WEEKS" --flavor=woff2 \
  --output-file=public/fonts/avengeance-isaac-weeks.woff2 \
  --no-hinting --desubroutinize
```
