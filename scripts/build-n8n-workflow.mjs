#!/usr/bin/env node
/**
 * Generates n8n/workflows/analyze_jd.json from data/projects.json.
 * Run from repo root: node scripts/build-n8n-workflow.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'n8n/workflows/analyze_jd.json');

const { projects } = JSON.parse(fs.readFileSync(path.join(root, 'data/projects.json'), 'utf8'));

const pos = (x, y) => [x, y];

const node = (id, name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters,
  id,
  name,
  type,
  typeVersion,
  position: pos(...position),
  ...extra,
});

const validateSecret = `const secret = $env.N8N_WEBHOOK_SECRET;
const item = $input.first().json;
const hdr = item.headers?.authorization || item.headers?.Authorization || '';
const token = typeof hdr === 'string' && hdr.match(/^Bearer\\s+(.+)$/i)
  ? hdr.replace(/^Bearer\\s+/i, '').trim()
  : '';
if (!secret) {
  return [{ json: { valid: true, body: item.body, headers: item.headers } }];
}
const valid = token === secret;
return [{ json: { valid, body: item.body, headers: item.headers } }];`;

const mergeInput = `const projects = ${JSON.stringify(projects)};
const body = $input.first().json.body || {};
const jdText = String(body.jdText || '').trim();
if (!jdText) throw new Error('jdText is required in the JSON body');
const jobUrl = String(body.jobUrl || body.jobPostingUrl || '').trim();
const companyWebsite = String(body.companyWebsite || '').trim();
const companyIntroduction = String(body.companyIntroduction || body.companyIntro || '').trim();
let capturedAt = String(body.capturedAt || '').trim();
if (!capturedAt) {
  capturedAt = new Date().toISOString();
}
const listing = {
  jobUrl,
  companyWebsite,
  companyIntroduction,
  capturedAt,
};
return [{ json: { jdText, projects, listing } }];`;

const parseScore = `function stripFence(s) {
  let t = String(s || '').trim();
  if (t.startsWith('\`\`\`')) {
    const nl = t.indexOf('\\n');
    t = nl === -1 ? '' : t.slice(nl + 1);
  }
  const end = t.lastIndexOf('\`\`\`');
  if (end !== -1) t = t.slice(0, end).trim();
  return t.trim();
}
function parseJsonish(s) {
  return JSON.parse(stripFence(s));
}
const msg = $input.first().json.message?.content || $input.first().json.text || '';
let parsedJd;
try {
  parsedJd = parseJsonish(msg);
} catch (e) {
  throw new Error('Parse JD: expected JSON object. Got: ' + String(msg).slice(0, 400));
}
const base = $('Merge Input').first().json;
const jdText = base.jdText;
const projects = base.projects;
const skillBag = (parsedJd.requiredSkills || []).concat(parsedJd.preferredSkills || []).map((x) => String(x).toLowerCase());
const kw = (parsedJd.keywords || []).map((x) => String(x).toLowerCase());
const blob = (parsedJd.responsibilities || []).join(' ').toLowerCase();
function scoreProject(p) {
  const tech = (p.techStack || []).map((x) => String(x).toLowerCase());
  const resp = (p.responsibilities || []).join(' ').toLowerCase();
  let s = 0;
  for (const t of tech) {
    for (const sk of skillBag) {
      if (sk && (t.includes(sk) || sk.includes(t))) s += 2;
    }
  }
  for (const k of kw) {
    if (k && (resp.includes(k) || tech.some((t) => t.includes(k)))) s += 1.5;
  }
  for (const k of kw) {
    if (k && blob.includes(k)) s += 0.5;
  }
  return Math.round(s * 10) / 10;
}
const ranked = projects
  .map((p) => ({ projectId: p.id, name: p.name, score: scoreProject(p), project: p }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);
const listing = base.listing || {};
return [{ json: { jdText, parsedJd, projects, rankedMatches: ranked, listing } }];`;

const assembleFinal = `function stripFence(s) {
  let t = String(s || '').trim();
  if (t.startsWith('\`\`\`')) {
    const nl = t.indexOf('\\n');
    t = nl === -1 ? '' : t.slice(nl + 1);
  }
  const end = t.lastIndexOf('\`\`\`');
  if (end !== -1) t = t.slice(0, end).trim();
  return t.trim();
}
function parseJsonish(s) {
  return JSON.parse(stripFence(s));
}
const gapRaw = $input.first().json.message?.content || '';
let gapAnalysis;
try {
  gapAnalysis = parseJsonish(gapRaw);
} catch (e) {
  gapAnalysis = { raw: gapRaw, parseError: String(e.message) };
}
const score = $('Parse and Score Projects').first().json;
const matchMsg = $('Match Explanation').first().json.message?.content || '';
const resumeMsg = $('Resume Generation').first().json.message?.content || '';
let matchBlock;
let resume;
try {
  matchBlock = parseJsonish(matchMsg);
} catch (e) {
  matchBlock = { explanations: [], raw: matchMsg };
}
try {
  resume = parseJsonish(resumeMsg);
} catch (e) {
  resume = { raw: resumeMsg };
}
const matches = (score.rankedMatches || []).map((rm) => {
  const ex = (matchBlock.explanations || []).find((e) => e.projectId === rm.projectId);
  return {
    projectId: rm.projectId,
    name: rm.name,
    score: rm.score,
    reasoning: ex?.fitSummary || ex?.reasoning || '',
    transferableSkills: ex?.transferableSkills || [],
  };
});
const listing = $('Merge Input').first().json.listing || {};
return [{ json: { listing, parsedJd: score.parsedJd, matches, resume, gapAnalysis } }];`;

const workflow = {
  name: 'analyze_jd',
  nodes: [
    node(
      'a1000001-0000-4000-8000-000000000001',
      'Webhook',
      'n8n-nodes-base.webhook',
      2,
      [0, 300],
      {
        httpMethod: 'POST',
        path: 'analyze-jd',
        responseMode: 'responseNode',
        options: {},
      },
      { webhookId: 'analyze-jd-webhook' }
    ),
    node(
      'a1000001-0000-4000-8000-000000000002',
      'Validate Secret',
      'n8n-nodes-base.code',
      2,
      [220, 300],
      {
        jsCode: validateSecret,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000003',
      'Authorized?',
      'n8n-nodes-base.if',
      1,
      [440, 300],
      {
        conditions: {
          boolean: [
            {
              value1: '={{ $json.valid }}',
              operation: 'equal',
              value2: true,
            },
          ],
        },
        combineOperation: 'all',
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000004',
      'Merge Input',
      'n8n-nodes-base.code',
      2,
      [660, 200],
      {
        jsCode: mergeInput,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000005',
      'Parse JD',
      'n8n-nodes-base.openAi',
      1.1,
      [880, 200],
      {
        resource: 'chat',
        operation: 'complete',
        chatModel: 'gpt-4o-mini',
        prompt: {
          messages: [
            {
              role: 'system',
              content:
                'You extract structured data from a job description. Reply with a single JSON object only (no markdown), keys: roleTitle (string), requiredSkills (string array), preferredSkills (string array), responsibilities (string array of short phrases), keywords (string array). Use English. Do not invent employers or credentials not implied by the text.',
            },
            {
              role: 'user',
              content: '={{ $json.jdText }}',
            },
          ],
        },
        options: {
          temperature: 0.2,
          maxTokens: 1200,
        },
        simplifyOutput: true,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000006',
      'Parse and Score Projects',
      'n8n-nodes-base.code',
      2,
      [1100, 200],
      {
        jsCode: parseScore,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000007',
      'Match Explanation',
      'n8n-nodes-base.openAi',
      1.1,
      [1320, 200],
      {
        resource: 'chat',
        operation: 'complete',
        chatModel: 'gpt-4o-mini',
        prompt: {
          messages: [
            {
              role: 'system',
              content:
                'You explain fit between job needs and candidate projects. The payload may include listing (jobUrl, companyWebsite, companyIntroduction, capturedAt) as user-provided context—use it only to frame fit; do not invent facts beyond listing + JD + projects. Reply with JSON only (no markdown): { "explanations": [ { "projectId": string, "fitSummary": string, "transferableSkills": string[] } ] }. Cover each project in rankedMatches. Use only evidence from the provided project objects; do not invent employers, dates, or metrics. English only.',
            },
            {
              role: 'user',
              content:
                '={{ JSON.stringify({ listing: $("Merge Input").first().json.listing, parsedJd: $json.parsedJd, rankedMatches: $json.rankedMatches }) }}',
            },
          ],
        },
        options: { temperature: 0.3, maxTokens: 2000 },
        simplifyOutput: true,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000008',
      'Resume Generation',
      'n8n-nodes-base.openAi',
      1.1,
      [1540, 200],
      {
        resource: 'chat',
        operation: 'complete',
        chatModel: 'gpt-4o-mini',
        prompt: {
          messages: [
            {
              role: 'system',
              content:
                'You write a concise resume tailored to the job using ONLY the project facts provided. If listing.companyIntroduction or listing.companyWebsite is present, you may align wording to that employer context without inventing new facts. Reply with JSON only (no markdown): { "summary": string, "highlights": string[] (bullet points), "skills": string[] }. You may only cite metrics that appear in impact.metricsVerified for a project; never invent numbers. English only.',
            },
            {
              role: 'user',
              content:
                '={{ JSON.stringify({ listing: $("Merge Input").first().json.listing, parsedJd: $("Parse and Score Projects").first().json.parsedJd, rankedMatches: $("Parse and Score Projects").first().json.rankedMatches }) }}',
            },
          ],
        },
        options: { temperature: 0.35, maxTokens: 2500 },
        simplifyOutput: true,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000009',
      'Gap Analysis',
      'n8n-nodes-base.openAi',
      1.1,
      [1760, 200],
      {
        resource: 'chat',
        operation: 'complete',
        chatModel: 'gpt-4o-mini',
        prompt: {
          messages: [
            {
              role: 'system',
              content:
                'You compare the job to the candidate project set and draft gap analysis. Reply with JSON only (no markdown): { "strengths": string[], "gaps": string[], "suggestedNextSteps": string[] }. Be specific; do not fabricate experience. English only.',
            },
            {
              role: 'user',
              content:
                '={{ JSON.stringify({ listing: $("Merge Input").first().json.listing, parsedJd: $("Parse and Score Projects").first().json.parsedJd, rankedMatches: $("Parse and Score Projects").first().json.rankedMatches, resumeLlmOutput: $json.message?.content }) }}',
            },
          ],
        },
        options: { temperature: 0.35, maxTokens: 2000 },
        simplifyOutput: true,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000010',
      'Assemble Final Response',
      'n8n-nodes-base.code',
      2,
      [1980, 200],
      {
        jsCode: assembleFinal,
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000011',
      'Respond OK',
      'n8n-nodes-base.respondToWebhook',
      1.1,
      [2200, 200],
      {
        respondWith: 'firstIncomingItem',
        options: {
          responseCode: 200,
          responseHeaders: {
            entries: [
              { name: 'Content-Type', value: 'application/json; charset=utf-8' },
            ],
          },
        },
      }
    ),
    node(
      'a1000001-0000-4000-8000-000000000012',
      'Respond Unauthorized',
      'n8n-nodes-base.respondToWebhook',
      1.1,
      [660, 420],
      {
        respondWith: 'json',
        responseBody: '{\n  "error": "Unauthorized"\n}',
        options: {
          responseCode: 401,
        },
      }
    ),
  ],
  connections: {
    Webhook: {
      main: [[{ node: 'Validate Secret', type: 'main', index: 0 }]],
    },
    'Validate Secret': {
      main: [[{ node: 'Authorized?', type: 'main', index: 0 }]],
    },
    'Authorized?': {
      main: [
        [{ node: 'Merge Input', type: 'main', index: 0 }],
        [{ node: 'Respond Unauthorized', type: 'main', index: 0 }],
      ],
    },
    'Merge Input': {
      main: [[{ node: 'Parse JD', type: 'main', index: 0 }]],
    },
    'Parse JD': {
      main: [[{ node: 'Parse and Score Projects', type: 'main', index: 0 }]],
    },
    'Parse and Score Projects': {
      main: [[{ node: 'Match Explanation', type: 'main', index: 0 }]],
    },
    'Match Explanation': {
      main: [[{ node: 'Resume Generation', type: 'main', index: 0 }]],
    },
    'Resume Generation': {
      main: [[{ node: 'Gap Analysis', type: 'main', index: 0 }]],
    },
    'Gap Analysis': {
      main: [[{ node: 'Assemble Final Response', type: 'main', index: 0 }]],
    },
    'Assemble Final Response': {
      main: [[{ node: 'Respond OK', type: 'main', index: 0 }]],
    },
  },
  settings: { executionOrder: 'v1' },
  staticData: null,
  meta: {
    templateCredsSetupCompleted: false,
  },
  pinData: {},
  tags: [],
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('Wrote', outPath);
