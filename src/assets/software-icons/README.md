# Software center artwork

These PNGs are bundled into the OPL Studio renderer and selected by the stable
software `packageId` or native `productId` in
`src/workbench/softwareArtworkRegistry.ts`.

- First-party OPL products use their published PNG artwork or a matching OPL
  style PNG generated for the product.
- The OPL Framework uses the generated package-modules mark because it is the
  shared foundation rather than a user-facing application.
- A private source never needs to expose an icon URL: the bundled mapping is
  used before any network asset.
- Unknown external plugins and runtime dependencies use `software-generic.png`.
  It is a neutral OPL package mark and is never rendered as a product logo.

The registry intentionally has no initials, type SVG, or remote SVG fallback.
