# School Travel Explorer (draft)

An interactive map of travel from where children live to public schools in the Brandywine, Christina, Colonial and
Red Clay Consolidated school districts (Delaware), by group and area. **Draft, not for citation.**

It describes areas and the groups of people who live there, using 2020 Census blocks. It uses no student records,
it does not describe individual families, and it makes no recommendations.

## What it shows

- **Map:** each block coloured by the chosen measure. Hover for the block's details.
- **Controls:**
  - Grade band: elementary, middle or high.
  - Travel by walking or driving.
  - Measure: time to the zoned school, zoning detour, time to the nearest school of a type, extra minutes to choose,
    options within a time limit, or charters within the 5-mile preference radius.
  - School type, time limit, and population (children or all residents).
- **Side panel:** statistics by race and Hispanic origin and by income, for the whole study area, a district, a
  clicked tract, or a region you draw. Income groups show 90% survey ranges for the study area and the districts.

## Data (all public)

- 2020 Census blocks and Redistricting Data (P.L. 94-171). Household population; children are under 18.
- American Community Survey 2020–2024, table B17024, by tract, spread to blocks. Income gaps are conservative.
- Delaware Department of Education: school directory, enrollment by grade, and 2026–27 attendance zones (FirstMap).
- Travel times computed on OpenStreetMap roads with OSRM: walking at 4 km/h, driving without traffic.

The files in `data/` are exported from the analysis project. They hold block-level travel measures (scaled
integers), group weights, school and tract lookups, and preset-area summaries with survey ranges.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. The page loads Leaflet 1.9.4 from cdnjs and the base map from OpenStreetMap.

## Not included

Traffic, road safety, school buses, transit, and admission rules (applications, lotteries, preferences, auditions).
Special programs that admit by referral are left out of the school types.
