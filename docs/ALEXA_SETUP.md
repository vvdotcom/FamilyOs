# Alexa voice for FamilyOS

Hold the Alexa button on the Fire TV remote and say "**Alexa, ask family o. s. to open the calendar**" or
"**…what's the weather?**". The FamilyOS app on the TV switches screens, and Alexa answers. Each step below says
who does it: **you** (it needs your accounts) or **Claude** (code and server changes).

## How it works, and why it's built this way

```
Fire TV remote ─► Alexa (speech, voice) ─► FamilyOS skill endpoint (/alexa on Railway)
                                             │  checks Amazon's signature, finds your household
                                             ▼
                                    "Alexa+ brain" (Bedrock tool loop)
                                             │  MCP over HTTP, with your linked sign-in
                                             ▼
                              FamilyOS MCP server (/mcp) ─► TV switches screens · answers come back
```

Amazon's Alexa+ MCP Toolkit, the real way to publish an Alexa+ add-on, is open only to select partners, not to
hackathon entrants. So FamilyOS does what the judges suggested:
- **The add-on is built to Alexa+'s spec:** an MCP server (protocol 2025-11-25, Streamable HTTP) with OAuth sign-in
  through Amazon Cognito.
- **An ordinary Alexa skill stands in for the add-on.** It reaches the MCP server over the MCP protocol with the
  family's linked token, the way an Alexa+ add-on host would.

In the video, label it: *"Alexa skill standing in for the Alexa+ add-on. The MCP Toolkit isn't open to hackathon
entrants."*

## Step 1: An Alexa sign-in client in Cognito (you, about 10 minutes)

Families link Alexa with their normal FamilyOS email and password. In the AWS console, open **Cognito → user pool
`us-west-2_8isgUyBvQ` (us-west-2)**:

1. **Domain:** under *App integration → Domain*, create a Cognito domain if there isn't one yet (for example
   `familyos-yourname`). Note the full address, like `https://familyos-yourname.auth.us-west-2.amazoncognito.com`.
2. **New app client** named `Alexa`, as a **confidential client** (generate a client secret).
3. **OAuth settings:**
   - **Authorization code grant** only.
   - Scopes **openid** and **email**.
   - Sign-in with the user pool itself.
   - Leave the callback URL as a placeholder; it comes from Alexa in step 3.
4. Optional: raise the refresh-token lifetime (for example to 365 days), so families don't have to relink every 30 days.
5. Keep the **client ID** and **client secret** handy. Send Claude the client ID only. The secret goes into the
   Alexa console in step 3 and nowhere else.

## Step 2: Create the skill (you, about 10 minutes)

The skill's definition is in this repo, under [`alexa-skill/`](../alexa-skill/).

**Option A: the Alexa developer console** (developer.amazon.com/alexa/console/ask)
1. **Create skill:** name **FamilyOS**, English (US), a **Custom** model, and **Provision your own** backend. Start
   from scratch.
2. **Build → Interaction Model → JSON Editor:** paste
   [`alexa-skill/skill-package/interactionModels/custom/en-US.json`](../alexa-skill/skill-package/interactionModels/custom/en-US.json),
   then **Save** and **Build**.
3. **Build → Endpoint:**
   - Choose **HTTPS**.
   - Default region: `https://familyos-api-production.up.railway.app/alexa`.
   - Certificate: *"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a
     certificate authority"*.
   - **Save.**

**Option B: the ASK CLI**
```powershell
npm install -g ask-cli
ask configure                 # signs in to your Amazon developer account in the browser
cd alexa-skill; ask deploy
```

Either way, copy the **Skill ID** (`amzn1.ask.skill.…`) and send it to Claude.

## Step 3: Account linking (you, about 5 minutes)

In the skill, open **Build → Tools → Account Linking** and turn it on:
- **Auth Code Grant.**
- Web Authorization URI: `https://<your Cognito domain>/oauth2/authorize`.
- Access Token URI: `https://<your Cognito domain>/oauth2/token`.
- Client ID and secret from step 1, and client authentication scheme **HTTP Basic**.
- Scopes: `openid` and `email`.
- **Save.**

The page then lists three **Alexa Redirect URLs**. Add all three to the Cognito `Alexa` client's **allowed callback
URLs**.

## Step 4: Turn on the endpoint (Claude, about 5 minutes)

Claude sets two Railway settings (both are IDs, not secrets) and redeploys:
- `FAMILYOS_ALEXA_SKILL_ID`: the skill ID from step 2. Requests signed for any other skill are refused.
- `FAMILYOS_MCP_COGNITO_CLIENT_IDS`: the Alexa client ID from step 1. The voice server only accepts sign-in tokens
  from this client.

## Step 5: Link and try it (you)

1. In the console's **Test** tab, set testing to **Development**.
2. In the **Alexa app** on your phone, go to *More → Skills & Games → Your Skills → Dev → FamilyOS → Enable*. Sign in
   with your **FamilyOS** email and password.
3. Try the console simulator first: type `ask family o. s. to open the calendar`.
4. Then the Fire TV. The FamilyOS app should be open and paired with your household. Hold the Alexa button and say:

| Say | What happens |
|---|---|
| "Alexa, ask family o. s. to open the calendar" | The TV opens the calendar (about 1–2 s) |
| "Alexa, ask family o. s. to show the calendar for Friday" | Friday's day view |
| "Alexa, ask family o. s. to show the wall calendar" | The big-clock wall view |
| "Alexa, ask family o. s. what's the weather" | Alexa says today's weather at home |
| "Alexa, ask family o. s. what's on today" | Alexa reads today's schedule |
| "Alexa, ask family o. s. who's picking up Emma" | Alexa answers from the calendar |
| "Alexa, ask family o. s. to swap Emma's pickup to Alex" | A request appears on the TV; a parent confirms it |
| "Alexa, open family o. s." | Starts a conversation: keep asking without repeating the name |

## If something goes wrong

| What you see or hear | Likely cause | Fix |
|---|---|---|
| "Open the Alexa app and link your FamilyOS account" | Not linked yet, or the link expired | Step 5.2 |
| Linking fails with a redirect error | A redirect URL is missing in Cognito | Step 3: add all three |
| Linked, but Alexa says FamilyOS isn't answering | The Alexa client ID isn't in `FAMILYOS_MCP_COGNITO_CLIENT_IDS` | Step 4 |
| "There was a problem with the requested skill's response" | The skill ID isn't set on Railway, or it doesn't match | Step 4 |
| Alexa answers, but the TV doesn't change | The FamilyOS app isn't open, or it isn't paired with the same household | Open FamilyOS on the TV; check pairing in Settings |
| Alexa opens something else | It heard a different skill name | Say "family o. s." clearly, or rename the skill to "family hub" |

## Privacy and control

- Every request is checked as signed by Amazon for this skill: certificate, signature, timestamp, and skill ID.
- Voice can read the schedule, chores, stars, and weather, and it can switch TV screens. Changes are only suggested;
  a parent confirms them on the TV or phone.
- To cut Alexa off, disable the skill in the Alexa app, or remove the `Alexa` app client in Cognito.
- Privacy page: <https://familyos-api-production.up.railway.app/privacy>.

## If Amazon opens the Alexa+ MCP Toolkit later

The MCP server already meets the add-on requirements: protocol 2025-11-25, Streamable HTTP, OAuth with PKCE through
Cognito, protected-resource metadata, and responses well under Amazon's 500 ms limit. Publishing it would use the
Alexa AI CLI (`alexa-ai new mcp …`, `alexa-ai deploy`) instead of this skill. See Amazon's
[MCP Toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html).
