# Hometide measurements

The agent evals (voice requests, guard rails, "Hometide noticed" and the wall note) are in [EVALS.md](./EVALS.md).

Numbers measured on 2026-09-29 unless noted. Each section lists how it was measured and what it does
**not** cover. Raw results live in [`services/family-agent/eval/results/`](../services/family-agent/eval/results/),
and each script can be rerun.

## Phone to TV: how fast a change appears

| | Result (12 trials) |
|---|---|
| Phone edit saved by the API | median **5 ms** |
| Change visible on the TV | min 0.1 s · median **1.9 s** · 90th percentile **3.2 s** · max 4.3 s |

- **How:** [`eval/measure_sync_latency.py`](../services/family-agent/eval/measure_sync_latency.py) adds an event through
  the same API the phone uses, then watches the TV web build (Chromium, 1920×1080) until the event is on screen.
  Each trial starts at a random point in the TV's 5-second refresh cycle.
- **Not covered:** the API and TV ran on one PC. On a Fire TV over home Wi‑Fi talking to Railway, add network
  round trips (typically tens to a few hundred milliseconds). This has not been measured on a physical Fire TV yet.
- **Design choice:** the TV polls every 5 s rather than holding a socket open. That's simple and battery-free on
  the phone, and it recovers on its own after Wi‑Fi drops. Worst case is about 5 s plus the network.

## Amazon Bedrock: tokens and cost per household

Model: Amazon Nova Lite (`us.amazon.nova-lite-v1:0`, us-west-2, on-demand) at $0.00006 per 1,000 input tokens and
$0.00024 per 1,000 output tokens ([AWS pricing example, Aug 2025](https://aws.amazon.com/blogs/machine-learning/demystifying-amazon-bedrock-pricing-for-a-chatbot-assistant/)).

| Feature (one request) | Input tokens | Output tokens | Cost | Median model latency |
|---|---|---|---|---|
| TV family briefing | 1,019 | ~145 | $0.000097 | 1.8 s |
| Flyer photo → calendar draft | 1,828 | 77 | $0.000128 | 2.0 s |
| Chore photo check | 1,806 | 41 | $0.000118 | 1.5 s |
| Simulated Alexa+ request (tool calls included) | 2,727 | ~108 | $0.000190 | 1.2 s per model turn |

- **How:** [`eval/measure_bedrock_cost.py`](../services/family-agent/eval/measure_bedrock_cost.py) runs the real API
  in-process and records the `usage` Bedrock returns for each call (about eight small calls per run).

**Per household per month** (the usage levels are assumptions; the per-request costs above are measured):

| | Typical family | Heavy family |
|---|---|---|
| Briefings (one per household change; identical ones are cached 5 min) | 30/day → $0.09 | 96/day → $0.28 |
| Chore photo checks (server cap: 30 per day) | 3/day → $0.01 | 30/day → $0.11 |
| Flyer/PDF imports | 12/month → $0.002 | 60/month → $0.008 |
| Voice requests | 5/day → $0.03 | 20/day → $0.11 |
| **Total AI cost** | **≈ $0.13 / month** | **≈ $0.51 / month** |

Hosting (Railway, Postgres) is not included and has not been measured per household.
Bedrock has been on in the hosted service since 2026-09-29, with a spending cap: 200 AI requests per household
per day and 5,000 across the service (about $1 a day at most). Over the cap, each feature falls back to its
non-AI version, and nothing fails silently.

## Compared with a Skylight Calendar

Prices checked 2026-09-29 on [Skylight's comparison page](https://myskylight.com/compare-calendars) and its
[subscription help article](https://skylight.zendesk.com/hc/en-us/articles/51833126965019-Subscription) (updated 2026-09-10).

| | Skylight Calendar | Hometide |
|---|---|---|
| Screen | 10" $149.99 · 15" $299.99 · 27" $569.99 | The Fire TV the family already owns |
| Magic Import, meal planning, rewards, photo screensaver | Calendar Plus, $79.99/year | Included: flyer/PDF/email import, meals, stars and rewards, TV photo slideshow |
| AI assistant | Skylight Assistant, $14.99/month or $119.99/year | Hometide's voice agent in the phone app (Strands on Bedrock); Bedrock AI costs about $0.13–$0.51 per household per month |
| First year, 15" screen with Plus | $379.98 | $0 in new hardware |

Hometide has no price yet. The comparison covers hardware and subscriptions only, and a family without a Fire TV
would need one (a Fire TV Stick is far cheaper than a Skylight screen).

## Calendar sync (Google, iCloud, Outlook)

- Google's public US-holidays feed (a real Google Calendar iCal URL, 120 KB) downloaded and parsed in under 1 s through
  the production code path: the address is checked and pinned, and TLS is verified against the real host name.
- Connecting that feed from the phone app's "Connected calendars" screen synced 9 events for the next three months.
- Requests to `localhost`, `127.0.0.1`, and the cloud metadata address `169.254.169.254` are refused before any
  connection is made.
- Private Google/iCloud/Outlook links have not been tested with a real family account yet.

## Automated tests

| Suite | Result |
|---|---|
| Family agent API (`pytest`) | 137 passed |
| TV UI on Vega (`jest`) | 26 passed |
| TV UI on Expo multi-TV (`jest`) | 15 passed |
| Phone app and shared TV UI | TypeScript typecheck clean |

The GitHub Actions workflow in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs these on every
push and pull request. It has not run on GitHub yet.

## Chore photo checks (earlier evaluation)

On 60 generated photos across three chores ([results](../services/family-agent/eval/results/bedrock.json)), Nova Lite
never called an unfinished chore "done" (0% false "looks done"). It answered "unclear" for 55% of photos, and its
exact-match accuracy was 45%. A parent approves every photo either way, and the AI verdict never awards stars by itself.
