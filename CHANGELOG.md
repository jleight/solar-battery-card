# Changelog

All notable changes to this project are documented here. The project follows
Semantic Versioning.

## [Unreleased]

### Added

- Added a **Show small values in W and Wh** option, on by default, that shows
  power under 1 kW in `W` and energy under 1 kWh in `Wh`.

### Fixed

- Hold each recorded power value until the next change in the 24-hour chart
  instead of interpolating toward it, so idle periods no longer ramp toward
  the next recorded state.
- Average each chart point over the window around it so short loads between
  points still appear.
- Distinguish `MW` (megawatts) from `mW` (milliwatts), and `MWh` from `mWh`,
  when converting entity units.
- Show values that round to zero without a minus sign instead of `-0.00`.

## [0.2.0] - 2026-09-05

### Added

- Added English and German localization for the card and visual editor, with
  regional German locale support and English fallback for unknown languages.
- Localized visible card copy and accessibility labels, including the chart SVG.

### Changed

- Made the visual editor read its locale directly from the Home Assistant
  instance supplied to the editor instead of relying on shared or browser state.
- Localized the default title at render time while preserving all explicit user
  titles unchanged.

## [0.1.6] - 2026-09-02

### Changed

- Clear chart inspection when a touch gesture is cancelled by scrolling.
- Confirmed Home Assistant's current card background variable with the legacy
  card background fallback throughout the card and chart tooltip.

## [0.1.5] - 2026-08-10

- Added keyboard, mouse, and touch inspection to the 24-hour power chart.
- Added Home Assistant theme-aware chart and tooltip surfaces.
