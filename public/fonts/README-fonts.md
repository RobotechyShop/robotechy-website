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
pixel-for-pixel match).

**License / source:** _Japanese Robot_ by Iconian Fonts (Daniel Zadorozny),
distributed free for personal use via Fonts2u
(<https://www.fonts2u.com/japanese-robot.font>). Commercial/embedding use should
be confirmed with the author (iconian.com) — as the shop's own brand asset it is
used here with the owner's rights, and only the ~0.7 KB **subset** below (the
fixed "ISAAC WEEKS" glyphs, unusable for any other text) is redistributed rather
than the full face. To keep the payload tiny the file shipped here is **subset to only
the glyphs needed for the fixed string "ISAAC WEEKS"** — the 7 unique letters
`I S A C W E K` plus a space (8 glyphs; 9 in the file counting the mandatory
`.notdef`), ~0.7 KB. It cannot set any other text.

Regenerate from the source `.ttf` (`Japanese_Robot_Italic.ttf`, kept out of the
repo) with:

```sh
pyftsubset "Japanese_Robot_Italic.ttf" \
  --text="ISAAC WEEKS" --flavor=woff2 \
  --output-file=public/fonts/isaac-weeks-japanese-robot.woff2 \
  --no-hinting --desubroutinize
```
