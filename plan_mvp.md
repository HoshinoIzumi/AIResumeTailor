# AI Resume Tailor — Phase-Based Plan (Next.js + n8n + Supabase)

---

## 0. System Overview

AI Resume Tailor is a **workflow-driven AI system** composed of three layers:

### Frontend — Next.js

* User input (Job Description)
* Result visualization
* Minimal API proxy layer

### Orchestration — n8n

* Core AI workflow execution
* Multi-step processing
* LLM interaction
* Scoring + routing logic

### Data Layer — Supabase

* Project library storage
* Analysis history
* Profile data

### How this doc aligns with [plan.md](plan.md)

* **[plan_mvp.md](plan_mvp.md) (this file)** = **execution path** to something **usable** first: n8n owns the workflow; contract stays minimal (`jdText`, English output) until you choose to expand.
* **[plan.md](plan.md)** = **full product spec**: profiles, bilingual, impact/metrics honesty, Zod, optional **code-first** stack without n8n. Use it to **upgrade** data shape and quality after MVP works — not as a gate before MVP.

---

## 1. System Architecture

```text
[ Next.js UI ]
      ↓
[ Next.js API Route ]
      ↓
[ n8n Webhook (Workflow Entry) ]
      ↓
[ JD Parsing (LLM) ]
      ↓
[ Project Matching (Code Node + LLM) ]
      ↓
[ Resume Generation (LLM) ]
      ↓
[ Gap Analysis (LLM) ]
      ↓
[ Supabase Storage ]
      ↓
[ Response JSON ]
      ↓
[ Next.js UI Rendering ]
```

*Phases 1–2: the Supabase step is **skipped** (local/mock data only). Persistence begins in Phase 3.*

---

## 2. n8n Deployment, MVP Scope & Webhook Security

### n8n deployment

* **Current choice**: run **n8n locally** for development (Docker or n8n desktop installer — pick one and stick to it in the repo README).
* **Production**: **not decided yet** — when you need a stable URL for the Next.js host, choose between n8n Cloud vs self-hosted (VPS/Docker) using ops constraints (uptime, cost, secrets handling). Document the decision in the same README when made.

### MVP scope (minimal first — aligned with your decision)

* **Single implicit profile** in Phase 1–2: one `projects.json` library; no `profileId` in the API contract yet.
* **Fixed output language**: default **English** for all LLM-generated resume and gap text (prompts assume EN; no locale switch in UI until a later phase).
* **Request body**: **`jdText` only** for `/api/analyze-jd` → n8n until you intentionally extend the contract.
* **Full product alignment** (multi-profile, `outputLocale`, bilingual runs, structured `impact` split) lives in [plan.md](plan.md); treat that as the **north star** and add fields incrementally when you exit “workflow MVP” mode.

### Webhook security

* **Never call n8n from the browser** — only the Next.js **server** route calls the webhook (already implied by “API proxy”).
* Add a **shared secret**: e.g. `N8N_WEBHOOK_SECRET` in Next.js and n8n; first node after Webhook validates `Authorization: Bearer …` or a custom header before running LLM nodes.
* Rotate the secret if the webhook URL leaks.

### LLM defaults (aligned with [plan.md](plan.md))

* **Provider**: **OpenAI** in n8n (credential on the LLM nodes).
* **Model**: start with **gpt-4o-mini** (or current equivalent mini model) for cost; move up when quality plateaus.
* **Structured output**: use n8n’s JSON / structured output modes where available so downstream nodes get parseable objects.

---

## MVP timeline (solo dev, using Cursor)

These are **rough ranges** — Cursor speeds up **boilerplate** (Next.js routes, types, UI scaffolding) but **not** n8n wiring, prompt tuning, or webhook debugging.

| Slice | What it includes | Rough calendar time |
| --- | --- | --- |
| **MVP “usable”** | [plan_mvp.md](plan_mvp.md) **Phase 1 + 2**: n8n workflow + `projects.json` + `/api/analyze-jd` + minimal results UI + loading/errors | **~3–6 full days** if n8n is already familiar; **~1–2 weeks** if learning n8n from scratch or only evenings |
| **+ Persistence** | **Phase 3**: Supabase tables, load projects from DB, save analyses | **+2–5 days** |
| **+ Hardening / polish** | Phases 4–5: prompts, JSON validation/retry, better UI | **+3–7+ days** (open-ended) |

**Practical target**: **about 1 focused week** to a demoable **JD in → JSON out in UI** (Phases 1–2); **~2 weeks** part-time. Adding Supabase and reliability layers is **another week or two** depending on scope.

---

## Phase 1 — Workflow MVP (No DB / Local Data)

### Goal

Validate the **core AI workflow** using n8n + static data.

---

### Deliverables

* n8n workflow: `analyze_jd` (run against **local n8n**; export workflow JSON into the repo for reproducibility)
* Local **`projects.json`** (single library; no separate `profiles.json` in this MVP slice)
* Working end-to-end pipeline
* Next.js UI (basic) — optional in Phase 1 if you want to prove n8n only first; otherwise minimal page in Phase 2

---

### Implementation

#### n8n Workflow Nodes

1. Webhook Trigger
2. Set Node (inject mock projects)
3. LLM Node — Parse JD
4. Code Node — Score Projects
5. LLM Node — Match Explanation
6. LLM Node — Resume Generation
7. LLM Node — Gap Analysis
8. Respond Node

---

### Data Flow Contract

#### Input (Phase 1–2 minimal contract)

```json
{
  "jdText": "string"
}
```

*Later extensions* (see [plan.md](plan.md)): `profileId`, `outputLocale` (`zh` | `en`), optional `candidateContext` — add only when UI and Supabase catch up.

#### Output

```json
{
  "parsedJd": {},
  "matches": [],
  "resume": {},
  "gapAnalysis": {}
}
```

---

### Acceptance Criteria

* Full flow runs in n8n without failure
* Output JSON is structured and usable
* No hallucinated experience
* Results are coherent
* Prompts and outputs are **English-only** for this MVP slice (consistent with §2 MVP scope)

---

### Risks

* Poor prompt design → generic outputs
* Noisy matching results
* Local n8n URL changes (e.g. port) — document base URL in `.env.example`

---

## Phase 2 — Next.js Integration Layer

### Goal

Connect frontend with n8n workflow.

---

### Deliverables

* `/api/analyze-jd` route
* UI input + output pages
* API proxy to n8n webhook

---

### Implementation

#### Next.js API Route

* Receives JD (`jdText` in body)
* Forwards request to **n8n webhook URL** from server env (e.g. `N8N_WEBHOOK_URL`) with **webhook secret** header (see §2)
* Returns structured JSON to the client
* **Do not** embed the raw n8n URL in client-side code

#### UI

* Input panel (JD textarea)
* Result sections:

  * Parsed JD
  * Matched Projects
  * Resume Output
  * Gap Analysis

---

### Acceptance Criteria

* User can run full analysis from UI
* Results render correctly
* Loading + error states handled

---

### Risks

* Direct frontend → n8n coupling (**forbidden** — use API route only)
* Poor UX flow
* Local dev: Next.js and n8n on different ports / CORS not an issue if all server-side

---

## Phase 3 — Supabase Integration (Persistence)

### Goal

Introduce **data persistence** without breaking workflow.

---

### Deliverables

* Supabase project setup
* Tables: profiles, projects, job_analyses
* n8n integration with Supabase

---

### Database Schema

#### profiles

* id
* name
* target_role

#### projects

* id
* profile_id
* name
* tech_stack (jsonb)
* responsibilities (jsonb)
* impact (jsonb)
* evidence_levels (jsonb)

#### job_analyses

* id
* profile_id
* jd_text
* parsed_jd (jsonb)
* match_results (jsonb)
* resume_output (jsonb)
* gap_analysis (jsonb)

*Optional alignment with [plan.md](plan.md)*: add `default_output_locale` on `profiles` and consolidate column names (`outputs` vs split fields) when you introduce bilingual output — not required for the minimal MVP row above.

---

### Implementation

* Replace mock data with Supabase queries (n8n **Supabase nodes** or HTTP to a thin Edge Function — pick one pattern and keep credentials out of the workflow JSON export if possible)
* Insert analysis results after workflow
* Add fallback to local JSON if needed
* **Auth / RLS**: defer strict multi-tenant RLS until needed; single-user + service role or simple policies is acceptable for MVP (same spirit as [plan.md](plan.md) Phase 4)

---

### Acceptance Criteria

* Projects load from Supabase
* Analysis results persist
* No regression in workflow

---

### Risks

* Over-complicated schema
* Supabase config issues

---

## Phase 4 — Workflow Hardening

### Goal

Make system **reliable and consistent**

---

### Deliverables

* Prompt refinement
* Validation layer
* Retry logic
* Scoring optimization

---

### Implementation

#### Prompt Rules

* No fabrication
* Evidence-based only
* Distinguish direct vs transferable skills

#### Validation

* JSON schema validation
* Retry on invalid output

#### Scoring Improvements

* Weighted skills
* Domain match
* Evidence level weighting

---

### Acceptance Criteria

* Outputs consistent across runs
* No hallucinated content
* Matching feels accurate

---

### Risks

* Over-constraining → robotic output
* Increased latency

---

## Phase 5 — UX & Productization

### Goal

Make it a **usable product**, not just a demo

---

### Deliverables

* Clean UI layout
* Copy/export buttons
* Multi-JD testing support
* Better visual hierarchy

---

### UI Sections

1. JD Input
2. Parsed JD
3. Project Matches
4. Resume Output
5. Gap Analysis

---

### Acceptance Criteria

* Easy to use without explanation
* Output readable and actionable

---

### Risks

* Over-investing in UI polish too early

---

## Phase 6 — Portfolio Readiness

### Goal

Turn into a **hireable project**

---

### Deliverables

* README (problem → solution → architecture)
* Architecture diagram
* 3 demo scenarios
* 2-minute explanation script

---

### Key Talking Points

* Why workflow > agent
* How hallucination is controlled
* Why structured data matters
* Tradeoff: rule-based vs LLM

---

### Acceptance Criteria

* Can clearly explain system design
* Can justify all tradeoffs
* Can demo smoothly

---

## Core Design Principles

1. Workflow over agent
2. Deterministic logic + LLM reasoning
3. Evidence-grounded generation
4. Structured outputs first

---

## Relationship to [plan.md](plan.md) (full product plan)

| Topic | This MVP (`plan_mvp.md`) | Full plan (`plan.md`) |
| --- | --- | --- |
| Orchestration | **n8n** as the workflow engine | Next.js `llmClient` + Route Handlers (no n8n) |
| Phase 1–2 contract | `jdText` only, single implicit profile, EN output | `profiles.json`, `profileId`, bilingual, Zod on server |
| Persistence | Phase 3+ | Phase 4 in full plan naming |
| **Migration** | Ship workflow first; when you need parity, either add n8n nodes/fields or port critical steps to code — **do not** block MVP on full parity |
| **Implementation tool** | Repo built with **Cursor** (AI-assisted editing); estimates above assume Cursor for Next.js/TS, not for replacing n8n design in the cloud |

---

## Definition of Done

**MVP (first shippable)** — enough when:

* A user can paste a JD in the Next.js UI and see **parsed JD, matches, resume, gap** without touching n8n directly
* Outputs are **good enough** to iterate on (does not need full [plan.md](plan.md) parity)

**Later / full product** — additionally:

* End-to-end workflow is stable under varied JDs
* Outputs are reliable; optional: data persists (Supabase)
* System design is explainable (portfolio-ready)

---

## Final Insight

> This project is not about “building with AI”.
> It is about making AI behave predictably inside a system.

---
