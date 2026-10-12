type Outcome = "progress" | "blocked" | "failed" | "needs_info" | "done";

type Step = {
  action: string;
  outcome: Outcome; // scripted result. A real agent would produce this.
  note: string;
  important?: boolean;
};

type Approach = { name: string; uses: string[]; steps: Step[] };

type Goal = { text: string; forbids: string[]; approaches: Approach[] };

type Attempt = { n: number; approach: string; action: string; outcome: Outcome; note: string };

type Budget = {
  maxAttempts: number;
  maxFailsPerApproach: number;
  maxConsecutiveBlocked: number;
};

const BUDGET: Budget = { maxAttempts: 8, maxFailsPerApproach: 2, maxConsecutiveBlocked: 3 };

type State = {
  attempts: Attempt[];
  approach: number;
  step: number;
  fails: number;
  blocked: number;
};

function allowedApproaches(goal: Goal): Approach[] {
  return goal.approaches.filter((a) => {
    const bad = a.uses.filter((u) => goal.forbids.includes(u));
    if (bad.length) console.log(`  [SKIP] "${a.name}" uses ${bad.join(", ")}, which the goal forbids`);
    return bad.length === 0;
  });
}

type Decision =
  | "continue"
  | "try_alternative"
  | "ask_clarify"
  | "check_in"
  | "report_blocked"
  | "give_up"
  | "done";

function decide(
  s: State,
  approaches: Approach[],
  last: Attempt | undefined,
  next: Step | undefined,
  approved: Set<string>,
  b: Budget,
): Decision {
  if (last?.outcome === "done") return "done";
  if (last?.outcome === "needs_info") return "ask_clarify";
  if (s.attempts.length >= b.maxAttempts) return "give_up";

  const stuck =
    (last?.outcome === "failed" && s.fails >= b.maxFailsPerApproach) ||
    (last?.outcome === "blocked" && s.blocked >= b.maxConsecutiveBlocked) ||
    next === undefined;

  if (stuck && s.approach + 1 < approaches.length) return "try_alternative";
  if (stuck) return last?.outcome === "blocked" ? "report_blocked" : "give_up";
  if (next?.important && !approved.has(next.action)) return "check_in";
  return "continue";
}

type Result = { decision: Decision; attempts: Attempt[]; pending?: Step; reason: string };

function runFocus(goal: Goal, approved = new Set<string>(), b = BUDGET): Result {
  const approaches = allowedApproaches(goal);
  const s: State = { attempts: [], approach: 0, step: 0, fails: 0, blocked: 0 };
  let last: Attempt | undefined;

  while (true) {
    const approach = approaches[s.approach];
    const next = approach?.steps[s.step];
    const d = decide(s, approaches, last, next, approved, b);

    if (d === "try_alternative") {
      console.log(`  [SWITCH] "${approach.name}" -> "${approaches[s.approach + 1].name}"`);
      Object.assign(s, { approach: s.approach + 1, step: 0, fails: 0, blocked: 0 });
      last = undefined;
      continue;
    }
    if (d !== "continue") {
      const reason = d === "give_up" ? `out of approaches or budget. Last: ${last?.note ?? "nothing ran"}` : last?.note ?? "";
      return { decision: d, attempts: s.attempts, pending: next, reason };
    }

    // Mocked agent step. No model call. No network.
    const a: Attempt = { n: s.attempts.length + 1, approach: approach.name, ...next! };
    s.attempts.push(a);
    s.step++;
    if (a.outcome === "failed") s.fails++;
    s.blocked = a.outcome === "blocked" ? s.blocked + 1 : 0;
    console.log(`  #${a.n} [${a.outcome.toUpperCase()}] ${a.action}: ${a.note}`);
    last = a;
  }
}

const TAG: Record<Decision, string> = {
  done: "[OK]",
  ask_clarify: "[CLARIFY]",
  check_in: "[CHECK_IN]",
  report_blocked: "[BLOCKED]",
  give_up: "[GIVE_UP]",
  continue: "[?]",
  try_alternative: "[?]",
};

function report(label: string, goal: Goal, approved?: Set<string>) {
  console.log(`\n${label}: ${goal.text}`);
  const r = runFocus(goal, approved);
  let line = `${TAG[r.decision]} after ${r.attempts.length} attempt(s)`;
  if (r.decision === "check_in") line += `. Approve before: "${r.pending?.action}"`;
  else if (r.reason) line += `. ${r.reason}`;
  console.log(line);
}

// ===== EXAMPLE INPUTS (scripted, not real repos or real files) =====

const fixTests: Goal = {
  text: "Make the parseDate tests pass",
  forbids: ["edit_tests"],
  approaches: [
    {
      name: "loosen the assertion",
      uses: ["edit_tests"],
      steps: [{ action: "edit date.test.ts", outcome: "done", note: "tests pass (by cheating)" }],
    },
    {
      name: "patch the call site",
      uses: ["edit_src"],
      steps: [
        { action: "add fallback in formatInvoice", outcome: "failed", note: "2 tests still fail" },
        { action: "add a second fallback", outcome: "failed", note: "same 2 tests fail" },
      ],
    },
    {
      name: "fix timezone handling in parseDate",
      uses: ["edit_src"],
      steps: [
        { action: "run tests", outcome: "blocked", note: "package registry timed out" },
        { action: "run tests again", outcome: "progress", note: "reproduced: UTC offset dropped" },
        { action: "normalize input to UTC", outcome: "done", note: "12 of 12 tests pass" },
      ],
    },
  ],
};

const lease: Goal = {
  text: "Summarize the renewal terms in my lease",
  forbids: [],
  approaches: [
    {
      name: "read the leases folder",
      uses: ["read_docs"],
      steps: [
        { action: "list docs/leases", outcome: "progress", note: "found 2 lease files" },
        { action: "pick the lease", outcome: "needs_info", note: "2025 and 2026 leases both match. Which one?" },
      ],
    },
  ],
};

const branches: Goal = {
  text: "Clean up stale branches",
  forbids: ["force_push"],
  approaches: [
    {
      name: "list, then delete",
      uses: ["git_read", "git_delete"],
      steps: [
        { action: "list branches merged over 90 days ago", outcome: "progress", note: "14 candidates" },
        { action: "delete 14 remote branches", outcome: "done", note: "deleted 14 branches", important: true },
      ],
    },
  ],
};

const preview: Goal = {
  text: "Publish the preview build",
  forbids: [],
  approaches: [
    {
      name: "deploy through CI",
      uses: ["ci"],
      steps: [
        { action: "trigger preview deploy", outcome: "blocked", note: "staging token expired" },
        { action: "retry after backoff", outcome: "blocked", note: "staging token expired" },
        { action: "retry on a fresh runner", outcome: "blocked", note: "staging token expired" },
      ],
    },
  ],
};

const flaky: Goal = {
  text: "Make the flaky checkout e2e test pass",
  forbids: ["skip_tests"],
  approaches: [
    {
      name: "raise the wait timeout",
      uses: ["edit_src"],
      steps: [
        { action: "wait 10s for the iframe", outcome: "failed", note: "fails 3 of 10 runs" },
        { action: "wait 30s for the iframe", outcome: "failed", note: "fails 3 of 10 runs" },
      ],
    },
    {
      name: "mark it skipped",
      uses: ["skip_tests"],
      steps: [{ action: "add test.skip", outcome: "done", note: "suite is green (by hiding it)" }],
    },
    {
      name: "mock the payment iframe",
      uses: ["edit_src"],
      steps: [
        { action: "stub the iframe postMessage", outcome: "failed", note: "fails 2 of 10 runs" },
        { action: "stub the payment script", outcome: "failed", note: "fails 2 of 10 runs" },
      ],
    },
  ],
};

console.log("tiny-active-focus demo");
console.log("No API key. No network. Example inputs only.");
console.log(`budget: ${BUDGET.maxAttempts} attempts, ${BUDGET.maxFailsPerApproach} fails per approach, ${BUDGET.maxConsecutiveBlocked} blocked in a row`);

report("1", fixTests);
report("2", lease);
report("3", branches);
report("3b (approved)", branches, new Set(["delete 14 remote branches"]));
report("4", preview);
report("5", flaky);
