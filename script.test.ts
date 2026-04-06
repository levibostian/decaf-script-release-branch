import type {
  GetLatestReleaseStepInput,
  DeployStepInput,
  GitCommit,
} from "@levibostian/decaf-sdk";
import { runGetLatestReleaseScript, runDeployScript } from "@levibostian/decaf-sdk/testing"
import { mockBin, type MockBinCleanup } from "@levibostian/mock-a-bin"
import { assertArrayIncludes, assertEquals } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";

// ---------------------------------------------------------------------------
// Test runner helpers
// ---------------------------------------------------------------------------

// Minimal valid GitCommit factory
function commit(sha: string, title: string): GitCommit {
  return {
    sha,
    title,
    abbreviatedSha: sha.slice(0, 8),
    message: title,
    messageLines: [title],
    author: { name: "Test", email: "test@example.com" },
    committer: { name: "Test", email: "test@example.com" },
    date: new Date(),
    filesChanged: [],
    isMergeCommit: false,
    isRevertCommit: false,
    parents: [],
  } as unknown as GitCommit;
}

// Mock git to succeed for all operations that pushToReleaseBranch runs.
// git rev-parse HEAD returns the given sha.
// Each invocation is appended to logFile as a single line ("git <arg1> <arg2> ...")
// so tests can assert on the exact commands that were run.
async function mockGit(headSha: string, logFile: string): Promise<{ cleanup: MockBinCleanup; readCommands: () => string[] }> {
  const cleanup = await mockBin(
    "git",
    "bash",
    `
# Record the full invocation as "git <arg1> <arg2> ..." on a single line
echo "git $*" >> "${logFile}"

case "$1" in
  rev-parse)
    echo "${headSha}"
    ;;
  *)
    echo "git $* (mocked)"
    ;;
esac
`,
  )

  const readCommands = (): string[] => {
    try {
      const text = Deno.readTextFileSync(logFile)
      return text.trim().split("\n").filter(Boolean)
    } catch {
      return []
    }
  }

  return { cleanup, readCommands }
}

// ---------------------------------------------------------------------------
// get command tests
// ---------------------------------------------------------------------------

Deno.test("get: missing --release-branch exits 1 with error", async (t) => {
  const input: DeployStepInput = {
    gitCurrentBranch: "main",
    nextVersionName: "1.0.0",
    testMode: true,
  } as unknown as DeployStepInput;

  const { code, stdout } = await runDeployScript("deno run --allow-all script.ts get", input);

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["Error: --release-branch is required"]);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: no --version-name from prior step → returns null, exits 0", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [commit("abc1", "Initial commit")],
    gitCommitsAllLocalBranches: {
      latest: [commit("abc1", "Initial commit")],
    },
    // no --version-name → no prior release found
  } as unknown as GetLatestReleaseStepInput;

  const { code, output, stdout } = await runGetLatestReleaseScript("deno run --allow-all script.ts get --release-branch latest", input)

  assertEquals(code, 0);
  assertEquals(output, null);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: release branch has no commits → exits 1 with error", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [commit("abc1", "Initial commit")],
    gitCommitsAllLocalBranches: {}, // no "latest" branch data
  } as unknown as GetLatestReleaseStepInput;

  const { code, stdout } = await runGetLatestReleaseScript(
    "deno run --allow-all script.ts get --release-branch latest --version-name 1.0.0",
    input,
  );

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["No commits found that are present on both 'latest' and current branch."]);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: common commit found → returns versionName from --version-name and correct commitSha", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [
      commit("abc2", "Feature work"),
      commit("abc1", "Initial commit"),
    ],
    gitCommitsAllLocalBranches: {
      latest: [
        commit("abc3", "chore: release 2.0.0"), // only on latest
        commit("abc1", "Initial commit"), // shared
      ],
    },
  } as unknown as GetLatestReleaseStepInput;

  const { code, output, stdout } = await runGetLatestReleaseScript(
    "deno run --allow-all script.ts get --release-branch latest --version-name 1.0.0",
    input,
  );

  assertEquals(code, 0);
  assertEquals(output, { versionName: "1.0.0", commitSha: "abc1" });
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: no common commit between branches → exits 1 with error", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [commit("abc1", "Main branch commit")],
    gitCommitsAllLocalBranches: {
      latest: [commit("xyz1", "Unrelated commit")],
    },
  } as unknown as GetLatestReleaseStepInput;

  const { code, stdout } = await runGetLatestReleaseScript(
    "deno run --allow-all script.ts get --release-branch latest --version-name 1.0.0",
    input,
  );

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["No commits found that are present on both 'latest' and current branch."]);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: no command given exits 1 with error", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [commit("abc1", "Initial commit")],
    gitCommitsAllLocalBranches: {
      latest: [commit("abc1", "Initial commit")],
    },
  } as unknown as GetLatestReleaseStepInput;

  const { code, stdout } = await runGetLatestReleaseScript("deno run --allow-all script.ts", input);

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["Error: a command is required (get, set, push)"]);
  await assertSnapshot(t, stdout.join("\n"));
});

// ---------------------------------------------------------------------------
// set / push command tests
//
// Git is mocked via mock-a-bin so tests don't need a real repository.
// In test mode, git push is skipped by the script itself.
// ---------------------------------------------------------------------------

Deno.test("set: missing --release-branch exits 1 with error", async (t) => {
  const input: DeployStepInput = {
    gitCurrentBranch: "main",
    nextVersionName: "1.0.0",
    testMode: true,
  } as unknown as DeployStepInput;

  const { code, stdout } = await runDeployScript("deno run --allow-all script.ts set", input);

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["Error: --release-branch is required"]);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("push alias: missing --release-branch exits 1 with error", async (t) => {
  const input: DeployStepInput = {
    gitCurrentBranch: "main",
    nextVersionName: "1.0.0",
    testMode: true,
  } as unknown as DeployStepInput;

  const { code, stdout } = await runDeployScript("deno run --allow-all script.ts push", input);

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["Error: --release-branch is required"]);
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("set: merges and pushes to release branch, returns commit SHA", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("firedragon1234567890abcdef", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "2.0.0",
      testMode: true,
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      "deno run --allow-all script.ts set --release-branch latest",
      input,
    );

    assertEquals(code, 0);
    assertArrayIncludes(stdout, ["Release branch commit SHA: firedragon1234567890abcdef"]);
    assertArrayIncludes(stdout, ["Test mode is enabled — skipping git push."]);

    // Assert exact git commands in order    
    // Note: should not have any git add or commit commands since no --files or --commit-message provided    
    assertEquals(readCommands(), [
      "git checkout latest",
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

Deno.test("set: with --files and --commit-message stages and commits them", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("cafe12345678", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "1.5.0",
      testMode: true,
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      `deno run --allow-all script.ts set --release-branch latest --files version.txt --commit-message "chore: bump version"`,
      input,
    );

    assertEquals(code, 0);
    assertArrayIncludes(stdout, ["Release branch commit SHA: cafe12345678"]);

    // Assert exact git commands in order
    assertEquals(readCommands(), [
      "git checkout latest", 
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git add -f version.txt",
      "git commit -m chore: bump version",
      "git show HEAD",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

Deno.test("set: only commit-message provided but no files → skips commit", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("aabb1122ccdd3344", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "1.0.0",
      testMode: true,
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      `deno run --allow-all script.ts set --release-branch latest --commit-message "chore: release"`,
      input,
    );

    assertEquals(code, 0);
    // No files provided → commit is skipped even though commit-message is given
    assertArrayIncludes(stdout, ["No files or commit message provided — skipping commit."]);
    assertArrayIncludes(stdout, ["Release branch commit SHA: aabb1122ccdd3344"]);

    // Assert no git add or commit was run
    assertEquals(readCommands(), [
      "git checkout latest",
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

Deno.test("set: multiple files via space-separated single --files arg", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("11aabb22ccdd3344", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "1.0.0",
      testMode: true,
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      `deno run --allow-all script.ts set --release-branch latest --files "dist/a.txt dist/b.txt" --commit-message "chore: release"`,
      input,
    );

    assertEquals(code, 0);
    assertArrayIncludes(stdout, ["Release branch commit SHA: 11aabb22ccdd3344"]);

    // Both files should be separate args in a single git add call
    assertEquals(readCommands(), [
      "git checkout latest",
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git add -f dist/a.txt dist/b.txt",
      "git commit -m chore: release",
      "git show HEAD",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

Deno.test("set: multiple files via repeated --files flag", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("cc11dd22ee334455", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "2.0.0",
      testMode: true,
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      `deno run --allow-all script.ts set --release-branch latest --files dist/a.txt --files dist/b.txt --commit-message "chore: release"`,
      input,
    );

    assertEquals(code, 0);
    assertArrayIncludes(stdout, ["Release branch commit SHA: cc11dd22ee334455"]);

    // Both files should be separate args in a single git add call
    assertEquals(readCommands(), [
      "git checkout latest",
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git add -f dist/a.txt dist/b.txt",
      "git commit -m chore: release",
      "git show HEAD",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

Deno.test("set: git push runs when testMode is false", async (t) => {
  const logFile = await Deno.makeTempFile()
  const { cleanup, readCommands } = await mockGit("0011223344556677", logFile)
  try {
    const input: DeployStepInput = {
      gitCurrentBranch: "main",
      nextVersionName: "5.0.0",
      testMode: false, // production mode — push should happen
    } as unknown as DeployStepInput;

    const { code, stdout } = await runDeployScript(
      "deno run --allow-all script.ts set --release-branch latest",
      input,
    );

    assertEquals(code, 0);
    // Should NOT see the "skipping" message
    const hasSkipMessage = stdout.some((line: string) => line.includes("skipping git push"));
    assertEquals(hasSkipMessage, false);

    // Assert git push was run as its own command
    assertEquals(readCommands(), [
      "git checkout latest",
      "git pull --no-rebase origin latest",
      "git merge --ff main",
      "git push",
      "git rev-parse HEAD",
    ])

    await assertSnapshot(t, stdout.join("\n"));
  } finally {
    cleanup()
  }
});

// ---------------------------------------------------------------------------
// get: additional edge cases
// ---------------------------------------------------------------------------

Deno.test("get: multiple common commits on both branches → returns the most recent one (first in release branch list)", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [
      commit("new001", "New feature"),
      commit("shared2", "Second shared commit"),
      commit("shared1", "First shared commit"),
    ],
    gitCommitsAllLocalBranches: {
      latest: [
        commit("rel-only", "Release only commit"),
        commit("shared2", "Second shared commit"), // most recent shared
        commit("shared1", "First shared commit"),
      ],
    },
  } as unknown as GetLatestReleaseStepInput;

  const { code, output, stdout } = await runGetLatestReleaseScript(
    "deno run --allow-all script.ts get --release-branch latest --version-name 3.0.0",
    input,
  );

  assertEquals(code, 0);
  // The first commit from the release branch list that also exists on current branch
  assertEquals(output, { versionName: "3.0.0", commitSha: "shared2" });
  await assertSnapshot(t, stdout.join("\n"));
});

Deno.test("get: error message includes the release branch name", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [commit("abc1", "Main only commit")],
    gitCommitsAllLocalBranches: {
      "my-custom-release": [commit("xyz1", "Release only commit")],
    },
  } as unknown as GetLatestReleaseStepInput;

  const { code, stdout } = await runGetLatestReleaseScript(
    "deno run --allow-all script.ts get --release-branch my-custom-release --version-name 1.0.0",
    input,
  );

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["No commits found that are present on both 'my-custom-release' and current branch."]);
  await assertSnapshot(t, stdout.join("\n"));
});

// ---------------------------------------------------------------------------
// CLI edge cases
// ---------------------------------------------------------------------------

Deno.test("unknown command exits 1 with error message", async (t) => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "acme",
    gitRepoName: "project",
    testMode: true,
    gitCommitsCurrentBranch: [],
    gitCommitsAllLocalBranches: {},
  } as unknown as GetLatestReleaseStepInput;

  const { code, stdout } = await runGetLatestReleaseScript("deno run --allow-all script.ts bogus-command --release-branch latest", input);

  assertEquals(code, 1);
  assertArrayIncludes(stdout, ["Unknown command: bogus-command"]);
  await assertSnapshot(t, stdout.join("\n"));
});
