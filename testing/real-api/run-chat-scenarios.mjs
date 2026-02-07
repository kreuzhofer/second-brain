#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultPort = process.env.PORT || '3000';
const BASE_URL = process.env.REAL_API_BASE_URL || process.env.API_BASE_URL || `http://localhost:${defaultPort}`;
const EMAIL = process.env.REAL_API_EMAIL || process.env.DEFAULT_USER_EMAIL;
const PASSWORD = process.env.REAL_API_PASSWORD || process.env.DEFAULT_USER_PASSWORD;
const RUN_ID = process.env.REAL_API_RUN_ID || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

if (!EMAIL || !PASSWORD) {
  console.error('Missing credentials: set REAL_API_EMAIL/REAL_API_PASSWORD or DEFAULT_USER_EMAIL/DEFAULT_USER_PASSWORD');
  process.exit(1);
}

const scenarioPathArg = process.argv[2];
const scenarioPath = scenarioPathArg
  ? path.resolve(process.cwd(), scenarioPathArg)
  : path.join(__dirname, 'scenarios', 'mutation-reliability.json');

function renderTemplate(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, vars));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = renderTemplate(v, vars);
    }
    return out;
  }
  return value;
}

async function requestJson(method, endpoint, token, body) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = { raw: text };
  }

  return { status: res.status, ok: res.ok, data };
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesIgnoreCase(haystack, needle) {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase());
}

function getByPath(obj, dotPath) {
  return String(dotPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function assertChatExpectations(step, response) {
  const expectConfig = step.expect || {};
  const content = response?.message?.content || '';

  if (Array.isArray(expectConfig.messageContainsAll)) {
    for (const phrase of expectConfig.messageContainsAll) {
      assertCondition(includesIgnoreCase(content, phrase), `Step ${step.name}: missing phrase "${phrase}" in assistant message`);
    }
  }

  if (Array.isArray(expectConfig.messageContainsAny) && expectConfig.messageContainsAny.length > 0) {
    const ok = expectConfig.messageContainsAny.some((phrase) => includesIgnoreCase(content, phrase));
    assertCondition(ok, `Step ${step.name}: assistant message did not match any expected phrase`);
  }

  if (Array.isArray(expectConfig.toolsUsedIncludes)) {
    const tools = response.toolsUsed || [];
    for (const tool of expectConfig.toolsUsedIncludes) {
      assertCondition(tools.includes(tool), `Step ${step.name}: expected tool "${tool}" in toolsUsed`);
    }
  }

  if (expectConfig.entryCategory) {
    assertCondition(response.entry?.category === expectConfig.entryCategory, `Step ${step.name}: expected entry category ${expectConfig.entryCategory}, got ${response.entry?.category}`);
  }

  if (typeof expectConfig.clarificationNeeded === 'boolean') {
    assertCondition(response.clarificationNeeded === expectConfig.clarificationNeeded, `Step ${step.name}: clarificationNeeded mismatch`);
  }
}

function assertSearchExpectations(step, response) {
  const expectConfig = step.expect || {};
  const entries = response.entries || [];

  if (typeof expectConfig.minResults === 'number') {
    assertCondition(entries.length >= expectConfig.minResults, `Step ${step.name}: expected at least ${expectConfig.minResults} results, got ${entries.length}`);
  }

  if (typeof expectConfig.maxResults === 'number') {
    assertCondition(entries.length <= expectConfig.maxResults, `Step ${step.name}: expected at most ${expectConfig.maxResults} results, got ${entries.length}`);
  }

  if (expectConfig.includesName) {
    assertCondition(entries.some((e) => includesIgnoreCase(e.name, expectConfig.includesName)), `Step ${step.name}: no entry name included "${expectConfig.includesName}"`);
  }

  if (expectConfig.includesStatus) {
    assertCondition(entries.some((e) => String(e.status || '').toLowerCase() === String(expectConfig.includesStatus).toLowerCase()), `Step ${step.name}: no entry with status "${expectConfig.includesStatus}"`);
  }

  if (expectConfig.includesCategory) {
    assertCondition(entries.some((e) => e.category === expectConfig.includesCategory), `Step ${step.name}: no entry in category "${expectConfig.includesCategory}"`);
  }
}

function assertEntryExpectations(step, status, response) {
  const expectConfig = step.expect || {};

  if (expectConfig.notFound === true) {
    assertCondition(status === 404, `Step ${step.name}: expected 404, got ${status}`);
    return;
  }

  assertCondition(status === 200, `Step ${step.name}: expected 200, got ${status}`);
  const entry = response?.entry || {};

  if (expectConfig.category) {
    assertCondition(response.category === expectConfig.category, `Step ${step.name}: category mismatch`);
  }
  if (expectConfig.status) {
    assertCondition(String(entry.status || '').toLowerCase() === String(expectConfig.status).toLowerCase(), `Step ${step.name}: status mismatch`);
  }
  if (expectConfig.nameIncludes) {
    assertCondition(includesIgnoreCase(entry.name, expectConfig.nameIncludes), `Step ${step.name}: name does not include "${expectConfig.nameIncludes}"`);
  }
}

function isCapturePrompt(content) {
  const text = String(content || '').toLowerCase();
  return (
    text.includes('would you like me to capture') ||
    text.includes('want me to capture') ||
    text.includes('would you like me to save') ||
    text.includes('want me to save') ||
    text.includes('capture that as') ||
    text.includes('save that as')
  );
}

function isGenericConfirmationPrompt(content) {
  const text = String(content || '').toLowerCase();
  return text.includes('would you like me') || text.includes('want me to');
}

function isAssistantErrorLike(content) {
  const text = String(content || '').toLowerCase();
  return (
    text.includes('there was an issue') ||
    text.includes("couldn't") ||
    text.includes('unable') ||
    text.includes('failed') ||
    text.includes('error')
  );
}

async function main() {
  const scenarioRaw = await readFile(scenarioPath, 'utf8');
  const scenario = JSON.parse(scenarioRaw);

  const vars = { RUN_ID };

  console.log(`Running scenario file: ${scenarioPath}`);
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`Base URL: ${BASE_URL}`);

  const login = await requestJson('POST', '/api/auth/login', null, {
    email: EMAIL,
    password: PASSWORD
  });

  assertCondition(login.ok, `Login failed (${login.status}): ${JSON.stringify(login.data)}`);
  const token = login.data?.token;
  assertCondition(Boolean(token), 'Login response missing token');

  let conversationId = null;

  for (const [index, originalStep] of scenario.steps.entries()) {
    const step = renderTemplate(originalStep, vars);
    const label = `${index + 1}/${scenario.steps.length} ${step.name}`;

    if (step.type === 'chat') {
      const payload = {
        message: step.message,
        conversationId: step.continueConversation === false ? null : conversationId
      };

      let res = await requestJson('POST', '/api/chat', token, payload);
      assertCondition(res.status === 201, `Step ${label}: chat failed (${res.status}) ${JSON.stringify(res.data)}`);

      if (
        step.autoConfirmCapture === true &&
        !res.data?.entry &&
        isCapturePrompt(res.data?.message?.content)
      ) {
        const confirmation = step.confirmationMessage || 'Yes as an admin task';
        res = await requestJson('POST', '/api/chat', token, {
          message: confirmation,
          conversationId: res.data?.conversationId
        });
        assertCondition(res.status === 201, `Step ${label}: capture confirmation failed (${res.status}) ${JSON.stringify(res.data)}`);
      }

      if (step.autoConfirm === true && isGenericConfirmationPrompt(res.data?.message?.content)) {
        const confirmation = step.confirmationMessage || 'Yes';
        res = await requestJson('POST', '/api/chat', token, {
          message: confirmation,
          conversationId: res.data?.conversationId
        });
        assertCondition(res.status === 201, `Step ${label}: generic confirmation failed (${res.status}) ${JSON.stringify(res.data)}`);
      }

      if (step.retryOnAssistantError === true && isAssistantErrorLike(res.data?.message?.content)) {
        const retryMessage = step.retryOnAssistantErrorMessage || step.message;
        res = await requestJson('POST', '/api/chat', token, {
          message: retryMessage,
          conversationId: res.data?.conversationId
        });
        assertCondition(res.status === 201, `Step ${label}: assistant-error retry failed (${res.status}) ${JSON.stringify(res.data)}`);
      }

      if (step.retryOnMissingSave === true && step.save && typeof step.save === 'object') {
        const hasAllSaveValues = Object.values(step.save).every((jsonPath) => {
          const candidates = String(jsonPath).split('|').map((part) => part.trim()).filter(Boolean);
          return candidates.some((candidate) => {
            const value = getByPath(res.data, candidate);
            return value !== undefined && value !== null && String(value).length > 0;
          });
        });
        if (!hasAllSaveValues) {
          const retryMessage = step.retryOnMissingSaveMessage || `Please capture this now: ${step.message}`;
          res = await requestJson('POST', '/api/chat', token, {
            message: retryMessage,
            conversationId: res.data?.conversationId
          });
          assertCondition(res.status === 201, `Step ${label}: retry capture failed (${res.status}) ${JSON.stringify(res.data)}`);
        }
      }

      assertChatExpectations(step, res.data);
      conversationId = res.data.conversationId;
      if (step.save && typeof step.save === 'object') {
        for (const [varName, jsonPath] of Object.entries(step.save)) {
          const candidates = String(jsonPath).split('|').map((part) => part.trim()).filter(Boolean);
          const value = candidates
            .map((candidate) => getByPath(res.data, candidate))
            .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).length > 0);
          assertCondition(value !== undefined && value !== null && String(value).length > 0, `Step ${step.name}: failed to save variable ${varName} from path ${jsonPath}`);
          vars[varName] = value;
        }
      }

      console.log(`PASS ${label}`);
      continue;
    }

    if (step.type === 'search') {
      const query = new URLSearchParams({ query: step.query });
      if (step.category) query.set('category', step.category);
      const res = await requestJson('GET', `/api/search?${query.toString()}`, token);
      assertCondition(res.ok, `Step ${label}: search failed (${res.status}) ${JSON.stringify(res.data)}`);
      assertSearchExpectations(step, res.data);

      console.log(`PASS ${label}`);
      continue;
    }

    if (step.type === 'entry') {
      const encodedPath = encodeURIComponent(step.path).replace(/%2F/g, '/');
      const res = await requestJson('GET', `/api/entries/${encodedPath}`, token);
      assertEntryExpectations(step, res.status, res.data);
      console.log(`PASS ${label}`);
      continue;
    }

    throw new Error(`Unsupported step type in scenario: ${step.type}`);
  }

  console.log('All scenario steps passed.');
}

main().catch((error) => {
  console.error(`Scenario run failed: ${error.message}`);
  process.exit(1);
});
