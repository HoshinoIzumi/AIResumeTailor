# AI Resume Tailor

Workflow-driven resume tailoring: **Next.js** (UI + API) · **n8n** (orchestration) · **Supabase** (persistence, later). This repo follows [plan_mvp.md](plan_mvp.md).

## Phase 1 — Workflow MVP (current)

Goal: run the full **analyze_jd** pipeline in n8n with static **`data/projects.json`** (no database yet).

### Prerequisites

- Docker (recommended) or a local [n8n](https://docs.n8n.io/hosting/installation/docker/) install
- An [OpenAI API](https://platform.openai.com/) key for n8n’s OpenAI nodes

### 1. Start n8n locally

```bash
cp .env.example .env
# Optional: set N8N_WEBHOOK_SECRET in .env for Bearer validation
docker compose up -d
```

Open **http://localhost:5678**, create an account on first run, then **Settings → Variables** (or rely on compose `environment`) so **`N8N_WEBHOOK_SECRET`** matches `.env` if you use it.

### 2. Import the workflow

1. In n8n: **Workflows → Import from File**.
2. Choose **`n8n/workflows/analyze_jd.json`**.
3. For **each of the four “Parse JD / Match / Resume / Gap” OpenAI nodes**, attach your **OpenAI API** credential (or create one under **Credentials**).

### 3. Regenerate the workflow after editing projects

The workflow embeds **`data/projects.json`** via a Code node. After you change the library:

```bash
node scripts/build-n8n-workflow.mjs
```

Re-import the generated **`n8n/workflows/analyze_jd.json`** (or paste the updated JSON into the editor).

### 4. Activate and call the webhook

1. **Activate** the workflow (toggle in the editor).
2. Copy the **production webhook URL** (POST). It should end with **`/webhook/analyze-jd`** (path from the Webhook node).
3. Send a test request:

```bash
curl -sS -X POST "http://localhost:5678/webhook/analyze-jd" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_N8N_WEBHOOK_SECRET" \
  -d '{
    "jdText": "We need a senior backend engineer with TypeScript, PostgreSQL, and payments experience.",
    "jobUrl": "https://example.com/jobs/123",
    "companyWebsite": "https://example.com",
    "companyIntroduction": "B2B payments platform, Series C, remote-first.",
    "capturedAt": "2026-04-06T12:00:00.000Z"
  }' | jq .
```

If **`N8N_WEBHOOK_SECRET`** is unset in n8n, the workflow allows all requests (dev only). If it is set, the Bearer token must match.

### Request body (beyond `jdText`)

Optional metadata for **your** records (any job board—paste into the UI or API later):

| Field | Meaning |
|--------|--------|
| `jobUrl` | Link to the job posting |
| `companyWebsite` | Company’s public website |
| `companyIntroduction` | Short blurb you copied or wrote about the employer |
| `capturedAt` | ISO-8601 time when you captured this row; **omitted → set by n8n at run time** |

Alias: `jobPostingUrl` → `jobUrl`, `companyIntro` → `companyIntroduction`.

### Success response shape

The webhook returns JSON of the form:

```json
{
  "listing": {
    "jobUrl": "",
    "companyWebsite": "",
    "companyIntroduction": "",
    "capturedAt": ""
  },
  "parsedJd": {},
  "matches": [],
  "resume": {},
  "gapAnalysis": {}
}
```

### Production n8n

Not fixed yet ([plan_mvp.md](plan_mvp.md) §2). When you deploy n8n, set **`WEBHOOK_URL`** to the public base URL, rotate **`N8N_WEBHOOK_SECRET`**, and store **`N8N_WEBHOOK_URL`** for Phase 2’s Next.js route.

## Phase 2 (next)

Next.js **`/api/analyze-jd`**, UI, and server-side proxy to this webhook — see [plan_mvp.md](plan_mvp.md).
