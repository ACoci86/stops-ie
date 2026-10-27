# Field check: does the record match the stop?

The site shows what the NTA has on file. Before anyone relies on it, we need to
know how often the file matches the ground. This is how to find out.

## 1. Pick the stops

From the project root, with the Python environment active:

```bash
python scripts/sample_stops.py --near 53.3498,-6.2603 --km 3
```

Use your own coordinates (right-click a spot in Google Maps to get them), or a
county:

```bash
python scripts/sample_stops.py --county "Galway City"
```

This writes `data/processed/field_check.csv` with 50 stops, half surveyed and
half not where possible. Change `--n` for a different number and `--seed` for a
different pick.

## 2. Visit them

Open the CSV in a spreadsheet. Each row has a Google Maps link. At each stop,
fill in the `actual_` columns with `yes` or `no`:

| Column | What to look for |
| --- | --- |
| shelter | A roofed shelter at the stop |
| bench | Somewhere to sit, inside or outside the shelter |
| rtpi | A screen showing live bus times |
| wheelchair | Could a wheelchair user board here: level kerb, clear footpath, space to wait |
| kerb | A raised kerb at the boarding point |
| footpath | A paved footpath leading to the stop |
| step | A step between the footpath and the boarding point |

Put the date in `visited_on`. Use `notes` for anything odd: a shelter that is
there but damaged, a stop that has moved, a pole with no sign.

A photo of each stop is worth taking. Name it by stop number.

## 3. Count

For each facility, count the rows where `recorded_` and `actual_` disagree.
That gives a hit rate per facility.

- Over 90% agreement: the field is trustworthy. Show it as we do now.
- 70% to 90%: show it, but say the record may be out of date.
- Under 70%: do not show it as a fact. Treat it as a hint.

Count surveyed and unsurveyed stops separately. Unsurveyed stops are shown as
"unknown" on the site, so the question there is whether they have facilities
the NTA simply has not recorded.

## 4. Record the result

Write the numbers in this file under a dated heading, with the area, the sample
size and the hit rate per facility. The Data sources page on the site should
quote the latest result.

## Results

None yet.
