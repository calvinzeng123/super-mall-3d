# Campus navigation glass revision

The exploration controls use a clear, lightly tinted glass material across desktop and compact layouts. Labels and icons have no glow, shadow, blurred backing or duplicated glyph layer. The upper drawer uses 6px padding and 44px targets; at 390 × 844 it measures 58px for phases alone or 105px with floors.

A shared optical lens moves between phase, floor and mobile dock controls. It uses a damped spring, responds to geometry changes and honors reduced motion. The dock keeps its last selection while closed and supports horizontal scrubbing among its three drawers. SVG backdrop displacement enhances Chromium; standard backdrop saturation and the reflective rim provide the fallback. Reduced transparency and unsupported backdrop filters use opaque material.

## Validation

- Build: npm run build:netlify succeeds; 49 runtime files, 52.86 MiB.
- Existing suite: 302 tests pass, zero failures.
- Chromium 390 × 844: phase/floor selection, automatic drawer close, tools/directory exclusivity, horizontal dock scrub, no viewport overflow.
- Chromium 844 × 390: 60px dock, 105px floor drawer; settled lenses align with their selected controls.
- Chromium 1280 × 800: desktop controls and phase/floor labels remain available.
- Clear view hides controls and a canvas tap restores them.
- Runtime console reports no errors during these checks.
- Computed label/icon filter and text-shadow are none.

Browser viewport emulation was used; no physical-iPhone validation is claimed. The original Netlify-only squad language-model endpoint remains outside this UI change.
