# Banner fonts

Two self-hosted fonts back the home hero banner text (see the `@font-face` rules
in `src/index.css`).

## `ubuntu-bold-italic.woff2`

Ubuntu Bold Italic — the exact font of the welcome quote in the source PSD
(`RobotechyBitcoinBannerImage.psd`). Ubuntu ships under the **Ubuntu Font
Licence 1.0**, which permits redistribution, so the full face is shipped.

## `isaac-weeks-japanese-robot.woff2`

**Japanese Robot _Italic_** — the exact green display font used for the "ISAAC
WEEKS" by-line in the source PSD. Verified by reading the PSD text layer, whose
`FontSet` names **`JapaneseRobot-Italic`** (an earlier revision incorrectly
assumed "Avengeance Heroic Avenger"; rendering all four Avengeance cuts against
the original showed a clear mismatch, while Japanese Robot Italic is a
pixel-for-pixel match). Japanese Robot is distributed as a **free font**
(via Fonts2u); to keep the payload tiny the file shipped here is **subset to only
the glyphs needed for the fixed string "ISAAC WEEKS"** — the letters
`I S A C W E K` plus a space (9 glyphs, ~0.7 KB). It cannot set any other text.

Regenerate from the source `.ttf` (`Japanese_Robot_Italic.ttf`, kept out of the
repo) with:

```sh
pyftsubset "Japanese_Robot_Italic.ttf" \
  --text="ISAAC WEEKS" --flavor=woff2 \
  --output-file=public/fonts/isaac-weeks-japanese-robot.woff2 \
  --no-hinting --desubroutinize
```
