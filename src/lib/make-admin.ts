/**
 * make-admin.ts
 * Make.com REST API v2 client for programmatic scenario management.
 * Region: us2 (matches existing hook URLs in env).
 */

const MAKE_API_BASE = "https://us2.make.com/api/v2";

async function makeApiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const apiKey = process.env.MAKE_API_KEY;
  if (!apiKey) throw new Error("MAKE_API_KEY is not set");

  const res = await fetch(`${MAKE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Make.com API ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Hook (webhook endpoint) ──────────────────────────────────────────────────

interface MakeHookResponse {
  hook: { id: number; name: string; address: string };
}

/**
 * Create a new custom webhook in Make.com.
 * Returns the hook ID and the public webhook URL (address).
 */
export async function createHook(
  name: string,
  teamId: number
): Promise<{ id: number; address: string }> {
  const data = await makeApiRequest<MakeHookResponse>("POST", "/hooks", {
    name,
    teamId,
  });
  return { id: data.hook.id, address: data.hook.address };
}

// ── Scenario ─────────────────────────────────────────────────────────────────

interface MakeScenarioResponse {
  scenario: { id: number; name: string };
}

/**
 * Create a stub scenario with a single webhook trigger module.
 * The user adds action modules in the Make.com UI after creation.
 */
export async function createScenario(
  name: string,
  teamId: number,
  hookId: number,
  description = ""
): Promise<{ id: number }> {
  const blueprint = {
    flow: [
      {
        id: 1,
        module: "gateway:CustomWebHook",
        version: 1,
        parameters: { hook: hookId, maxResults: 1 },
        mapper: {},
        metadata: { designer: { x: 0, y: 0 } },
      },
    ],
    metadata: {
      version: 1,
      scenario: {
        roundtrips: 1,
        maxErrors: 3,
        autoCommit: true,
        autoCommitTriggerLast: true,
        sequential: false,
        confidential: false,
        dataloss: false,
        dlq: false,
        freshVariables: false,
      },
      designer: { orphans: [] },
      zone: "us2.make.com",
    },
  };

  const data = await makeApiRequest<MakeScenarioResponse>("POST", "/scenarios", {
    name,
    teamId,
    blueprint: JSON.stringify(blueprint),
    scheduling: { type: "indefinitely", interval: 900 },
    description,
  });

  return { id: data.scenario.id };
}

// ── List scenarios ────────────────────────────────────────────────────────────

interface MakeScenarioSummary {
  id: number;
  name: string;
  isActive: boolean;
  isPaused: boolean;
  teamId: number;
}

interface MakeScenariosListResponse {
  scenarios: MakeScenarioSummary[];
}

export async function listScenarios(teamId: number): Promise<MakeScenarioSummary[]> {
  const data = await makeApiRequest<MakeScenariosListResponse>(
    "GET",
    `/scenarios?teamId=${teamId}&pg[limit]=100`
  );
  return data.scenarios ?? [];
}
