# NW Coast Wind and Current

One zoomable map of the NW Coast (Puget Sound → Sitka):
flip between **surface currents** (NOAA SSCOFS) and **wind** (ECCC HRDPS 2.5 km) at the same view.

Live: https://dsleaf1.github.io/salish-marine-map/

Fully client-side; forecast data is served from Cloudflare R2. An experimental **wave-steepness**
layer (wind-against-current hazard) is under validation and hidden by default — append `?steep=1`
to view it, along with the physics write-up (`steepness_physics.pdf`).

Advisory only — not for navigation.
