# Publishing the Next Tram Alexa skill

One public skill for everyone, hosted on the NextTram Vercel app. No AWS account or Lambda needed.

- Endpoint: `https://app.nexttram.morgado.tech/api/alexa` (checks Amazon's request signature, as certification requires)
- Voice models: `alexa/interaction-model.en-US.json`, `en-GB.json` (same), `de-DE.json`
- Privacy policy: `https://app.nexttram.morgado.tech/privacy.html`
- Support email: `nextTram@morgado.tech`
- Icons: `docs/alexa/icon-108.png`, `docs/alexa/icon-512.png`

What people say:

| | English | German |
|---|---|---|
| Open | “Alexa, open next tram” | “Alexa, öffne nächste Bahn” |
| Ask | “Alexa, ask next tram when is the next tram” | “Alexa, frag nächste Bahn wann kommt die nächste Bahn” |
| Way back | “Alexa, ask next tram when is the next tram home” | “Alexa, frag nächste Bahn wann komme ich nach Hause” |
| Use own stops | “Alexa, ask next tram to connect my stops” | “Alexa, sag nächste Bahn verbinde meine Haltestellen” |
| Forget them | “Alexa, ask next tram to forget my stops” | “Alexa, sag nächste Bahn vergiss meine Haltestellen” |

Without connecting, the skill answers for the built-in first route (Leipzig Hbf). “Connect my stops” makes Alexa say a 6-digit number; typing it in the app (AI → Alexa) links that Alexa user to the app's favorites, and Alexa then answers for the first favorite. Alexa can't be triggered by “Alexa, when is the next tram” without the skill name, except through an Alexa routine (explained in the app's Alexa guide).

## 1. Create the skill

1. Open <https://developer.amazon.com/alexa/console/ask> → **Create Skill**.
2. **Name:** `Next Tram`. **Primary locale:** German (DE) or English (US).
3. **Experience:** Other. **Model:** Custom. **Hosting:** Provision your own. → **Next**.
4. **Template:** Start from Scratch → **Create skill**.

## 2. Voice model

1. Left menu: **Interaction Model** → **JSON Editor**.
2. Select all, delete, paste the file for this language (copy it from GitHub, *Raw* button):
   - English (US): `alexa/interaction-model.en-US.json`
   - German: `alexa/interaction-model.de-DE.json`
3. **Save**, then **Build skill**. Wait for “Build successful”.

The invocation name comes with the JSON: `next tram` (English) and `nächste bahn` (German).

## 3. Endpoint

1. Left menu: **Endpoint** → **HTTPS**.
2. **Default Region:** `https://app.nexttram.morgado.tech/api/alexa`
3. SSL certificate type: **My development endpoint has a certificate from a trusted certificate authority**.
4. **Save**.
5. Optional but recommended: copy the **Skill ID** shown at the top of the Endpoint page (`amzn1.ask.skill.…`). In Vercel → project next-tram → Settings → Environment Variables, add `ALEXA_SKILL_ID` with that value (Production), then redeploy. The endpoint then refuses requests meant for other skills.

The endpoint needs the merged code on `main` (production), and “connect my stops” needs the Upstash storage connected in Vercel (same as the favorites sync).

## 4. Test

1. Top tab **Test** → switch **Off** to **Development**.
2. Type or say: `open next tram` → you hear the next tram.
3. `ask next tram when is the next tram home`, `help`, `stop` should all answer.
4. `ask next tram to connect my stops` → note the number, open the app → AI → Alexa → type it → **Connect**. Ask again; it now uses your first favorite.
5. Your own Echo devices (same Amazon account) can use the skill while it's in development, no publishing needed.

## 5. Second language

Top left, the language dropdown → **Language settings** → **Add new language** (German or English (US); English (UK) too if you like, using `en-GB.json`). Then repeat step 2 for each language. The endpoint is shared.

## 6. Distribution (store listing)

Tab **Distribution**, per language:

| Field | English | German |
|---|---|---|
| Public name | Next Tram | Nächste Bahn |
| One sentence | Hear when your next tram or bus leaves, and when to walk out the door. | Hör, wann deine nächste Bahn oder dein Bus fährt und wann du losgehen musst. |
| Detailed | Next Tram tells you when to leave for your tram or bus in Leipzig and Berlin, with live delays. Just ask “when is the next tram”. It answers for your first favorite in the free NextTram app (app.nexttram.morgado.tech): say “connect my stops” and type the number Alexa tells you into the app. Without connecting, it uses Leipzig main station. | Nächste Bahn sagt dir, wann du zu deiner Straßenbahn oder deinem Bus in Leipzig und Berlin losgehen musst, mit Live-Verspätungen. Frag einfach „wann kommt die nächste Bahn“. Die Antwort gilt für deinen ersten Favoriten in der kostenlosen NextTram App (app.nexttram.morgado.tech): sag „verbinde meine Haltestellen“ und gib die Nummer, die Alexa nennt, in der App ein. Ohne Verbindung nimmt sie den Leipziger Hauptbahnhof. |
| What's new | First release. | Erste Version. |
| Example phrases | Alexa, open next tram · Alexa, ask next tram when is the next tram · Alexa, ask next tram to connect my stops | Alexa, öffne nächste Bahn · Alexa, frag nächste Bahn wann kommt die nächste Bahn · Alexa, sag nächste Bahn verbinde meine Haltestellen |
| Small / large icon | `docs/alexa/icon-108.png` / `docs/alexa/icon-512.png` | same |
| Category | Travel & Transportation → Public Transportation | Reisen & Verkehr → Öffentlicher Verkehr |
| Keywords | tram, bus, departures, Leipzig, Berlin, public transport, LVB, BVG | Straßenbahn, Bahn, Bus, Abfahrt, Leipzig, Berlin, ÖPNV, LVB, BVG |
| Privacy Policy URL | https://app.nexttram.morgado.tech/privacy.html | same |
| Terms of Use URL | leave empty | leer lassen |

**Privacy & Compliance:** Does it allow purchases? No. Collects personal information? No. Directed to children under 13? No. Contains advertising? No. Tick the export compliance box. Testing instructions:

> No account or setup is needed. “open next tram” answers for a built-in route (Leipzig main station) with live departures. “connect my stops” is optional: it says a one-time 6-digit number that the user types into the free NextTram web app (https://app.nexttram.morgado.tech → AI → Alexa) to use their own saved stops; “forget my stops” removes the link.

**Availability:** Public. Countries: Germany is enough (the stops are Leipzig and Berlin), or all countries.

## 7. Certification

Tab **Certification** → **Validation** (fix anything red) → **Functional test** → **Submission** → **Submit for review**. Amazon usually answers within a few days by email. Once live, people find it in the Alexa app under Skills & Games → “Next Tram”.
