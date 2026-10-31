# Overload: workout planner and progressive overload tracker

A phone-first web app that:

1. Takes your body stats, goal and timeline, then works out calories, protein and whether the goal is realistic.
2. Recommends how many days a week to train, and which split, with reasons.
3. Generates a day-by-day plan as editable workout cards (swap, reorder, add or remove exercises, change sets/reps/RIR/rest, reassign weekdays).
4. Opens on **today's workout**. Each exercise shows what you lifted last time and tells you whether to add weight, add reps, hold, or back off, and by how much.

Your data stays on the device (localStorage). Use **Settings → Export backup** now and then.

## Run locally

```bash
cd "/Users/arunbiyani/Training App" && python3 -m http.server 5173
```

Then open http://localhost:5173.

## Put it on your phone

The app needs to be served over HTTPS for the phone to install it and use it offline. Any static host works, since there is no build step. For example, GitHub Pages:

1. Push this folder to a GitHub repository.
2. Repository → Settings → Pages → deploy from the `main` branch, root folder.
3. Open the Pages URL on your phone, then **Share → Add to Home Screen** (iPhone) or **Install app** (Android).

After the first load it works offline at the gym.

## How the suggestions work

| Area | Rule | Source |
|---|---|---|
| Calories | Mifflin-St Jeor BMR × activity, ± goal adjustment | Mifflin 1990 |
| Fat-loss rate | 0.5–1 % of body weight per week; warns if faster | Helms 2014, Garthe 2011 |
| Muscle-gain rate | ~1–1.5 / 0.5–1 / 0.25–0.5 % of body weight per month (beginner / intermediate / advanced) | Aragon & McDonald models |
| Protein | 1.8 g/kg (gaining), 2.2 g/kg (dieting or recomp) | Morton 2018, Helms 2014 |
| Volume | ~10–20 hard sets per muscle per week, shown in the plan | Schoenfeld 2017 |
| Frequency | Each muscle at least 2× per week | Schoenfeld 2016 |
| Effort | Working sets at 1–3 reps in reserve (RPE 7–9) | Refalo 2023, Helms 2016 |
| Progression | Double progression: add reps up to the top of the range, then add load (~2.5 % upper-body compounds, ~5 % lower-body and isolation, rounded to your gym's smallest jump). Double jump if RPE ≤ 7; repeat the weight if you hit failure; −10 % after two sessions under the range | NSCA / ACSM progression guidelines |
| Deloads | Every 8 / 5 / 4 weeks (beginner / intermediate / advanced): half the sets at ~90 % load | Bell 2023 (deload consensus) |

Logging RPE is optional, but it makes the suggestions sharper.

## Optional AI coach

Add an Anthropic API key in **Settings** to get a "Ask AI coach to adjust this plan" box in the Plan tab (for example: "sore shoulder, avoid overhead pressing"). It calls `claude-opus-5-5` directly from the browser. The key is stored only on your device.

## Files

- `js/planner.js` – body metrics, day recommendation, split templates, plan generation
- `js/progression.js` – the overload engine
- `js/exercises.js` – exercise library
- `js/app.js` – UI
- `js/store.js` – storage, backup, unit conversion
- `js/ai.js` – optional Claude integration
- `sw.js`, `manifest.webmanifest` – offline/install support
