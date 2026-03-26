import type {
  GetLatestReleaseStepInput,
  GetLatestReleaseStepOutput,
  DeployStepInput,
  GitCommit,
} from "@levibostian/decaf-sdk";
import { assertEquals, assertStringIncludes } from "@std/assert"

// a decaf script test runner essentially. Copied from decaf: https://github.com/levibostian/decaf/blob/a0e324f7209c0f37b9d275b7259fcefd591a17c6/steps/get-next-release.test.ts#L4
// would be nice to put into decaf or the sdks in the future. 
async function runScript(input: GetLatestReleaseStepInput | DeployStepInput, args: string[], mockGitHubReleases: {name: string; tagName: string}[]): Promise<{code: number; output: GetLatestReleaseStepOutput | null, stdout: string}> {
  // make test mode always enabled. instead of mocking running commands, we rely on the testMode flag to not actually run commands.
  input.testMode = true;

  // Write input to a temp file
  const tempFile = await Deno.makeTempFile()
  const inputFileContents = JSON.stringify(input)
  await Deno.writeTextFile(tempFile, inputFileContents)

  // Get absolute path to get-next-release.ts
  const scriptPath = new URL("./script.ts", import.meta.url).pathname

  const env: Record<string, string> = { 
    INPUT_GITHUB_TOKEN: "", 
    DATA_FILE_PATH: tempFile, 
    ...Deno.env.toObject() 
  };
  
  env.MOCK_GITHUB_RELEASES = JSON.stringify(mockGitHubReleases);

  const process = new Deno.Command("deno", {
    args: ["run", "--allow-all", scriptPath, ...args],
    env,
    stdout: "piped",
    stderr: "piped",
  })

  const child = process.spawn()
  const { code, stdout, stderr } = await child.output()
  
  const outputFileContents = await Deno.readTextFile(tempFile)
  let output: GetLatestReleaseStepOutput | null = null
  if (outputFileContents != inputFileContents) {
    output = JSON.parse(outputFileContents)
  }

  // Combine stdout and stderr for the test assertions
  const combinedOutput = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr)

  return { code, output, stdout: combinedOutput }
}

Deno.test("given no tags on the current branch, expect null for latest release", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [
      {
        sha: "abc1",
        title: "Initial commit",
        tags: [],
        message: "Initial commit",
      },
      {
        sha: "abc2",
        title: "Add feature",
        tags: [],
        message: "Add feature",
      }
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  const { code, output } = await runScript(input, ["get"], [])

  assertEquals(code, 0)
  assertEquals(output, null)
})

Deno.test("given git tags exist and matching GitHub release exists, expect release info", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [
      {
        sha: "abc1",
        title: "Initial commit",
        tags: [],
        message: "Initial commit",
      },
      {
        sha: "abc2",
        title: "Release v1.0.0",
        tags: ["v1.0.0"],
        message: "Release v1.0.0",
      }
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  const { code, output } = await runScript(input, ["get"], [
    { name: "Release v1.0.0", tagName: "v1.0.0" },
    { name: "Release v0.9.0", tagName: "v0.9.0" }
  ])

  assertEquals(code, 0)
  assertEquals(output, {
    versionName: "Release v1.0.0",
    commitSha: "abc2"
  })
})

Deno.test("given multiple commits with tags, should use the first (latest) commit with tags", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [     
      {
        sha: "abc2",
        title: "Release v2.0.0",
        tags: ["v2.0.0"],
        message: "Release v2.0.0",
      },
      {
        sha: "abc3",
        title: "Release v1.0.0",
        tags: ["v1.0.0"],
        message: "Release v1.0.0",
      },
      {
        sha: "abc1",
        title: "Initial commit",
        tags: [],
        message: "Initial commit",
      },
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  const { code, output } = await runScript(input, ["get"], [
    { name: "Release v2.0.0", tagName: "v2.0.0" },
    { name: "Release v1.0.0", tagName: "v1.0.0" }
  ])

  assertEquals(code, 0)
  assertEquals(output, {
    versionName: "Release v2.0.0",
    commitSha: "abc2"
  })
})

Deno.test("given git tags exist but no GitHub releases, expect null", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [
      {
        sha: "abc1",
        title: "Initial commit",
        tags: [],
        message: "Initial commit",
      },
      {
        sha: "abc2",
        title: "Release v1.0.0",
        tags: ["v1.0.0"],
        message: "Release v1.0.0",
      }
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  // Mock no GitHub releases
  const { code, output } = await runScript(input, ["get"], [])

  assertEquals(code, 0)
  assertEquals(output, null)
})

Deno.test("given git tags exist and GitHub releases exist but no matching release for latest tag, expect null", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [
      {
        sha: "abc1",
        title: "Initial commit",
        tags: [],
        message: "Initial commit",
      },
      {
        sha: "abc2",
        title: "Release v2.0.0",
        tags: ["v2.0.0"],
        message: "Release v2.0.0",
      }
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  // Mock GitHub releases that don't match the latest tag
  const mockReleases = [
    { name: "Release v1.0.0", tagName: "v1.0.0" },
    { name: "Release v1.1.0", tagName: "v1.1.0" }
  ];

  const { code, output } = await runScript(input, ["get"], mockReleases)

  assertEquals(code, 0)
  assertEquals(output, null)
})

Deno.test("given on a maintenance branch with newer releases available on main branch, expect release matching latest tag on maintenance branch", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "v1", // a maintenance branch
    gitRepoOwner: "levibostian",
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [      
      {
        sha: "abc2",
        title: "Patch release v1.5.1",
        tags: ["v1.5.1"],
        message: "Patch release v1.5.1",
      },
      {
        sha: "abc1",
        title: "Initial v1 branch commit",
        tags: [],
        message: "Initial v1 branch commit",
      },
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  // Mock GitHub releases including newer releases (v3.0.0, v2.0.0) but also the one matching our branch (v1.5.1)
  const mockReleases = [
    { name: "Release v3.0.0", tagName: "v3.0.0" }, // Newer release from main branch
    { name: "Release v2.5.0", tagName: "v2.5.0" }, // Another newer release
    { name: "Release v2.0.0", tagName: "v2.0.0" }, // Another newer release
    { name: "Release v1.5.1", tagName: "v1.5.1" }, // The one we want - matches our maintenance branch
    { name: "Release v1.5.0", tagName: "v1.5.0" }, // Older release on v1 branch
    { name: "Release v1.0.0", tagName: "v1.0.0" }  // Even older release
  ];

  const { code, output } = await runScript(input, ["get"], mockReleases)

  assertEquals(code, 0)
  assertEquals(output, {
    versionName: "Release v1.5.1",
    commitSha: "abc2"
  });
});

Deno.test("set command with default arguments should generate correct gh command", async () => {
  const input = {
    nextVersionName: "v1.0.0",
    gitCurrentBranch: "foo"
  } as unknown as DeployStepInput;

  const { code, stdout } = await runScript(input, ["set"], []);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "Running in test mode, skipping creating GitHub release.");
  assertStringIncludes(stdout, "gh release create v1.0.0 --generate-notes --latest --target foo");
});

Deno.test("set command with custom arguments should override defaults", async () => {
  const input = {
    nextVersionName: "v2.0.0"
  } as unknown as DeployStepInput;

  const { code, stdout } = await runScript(input, ["set", "--draft", "--notes", "Custom release notes"], []);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "Running in test mode, skipping creating GitHub release.");
  assertStringIncludes(stdout, "gh release create v2.0.0 --draft --notes Custom release notes");
});

Deno.test("set command with GitHub release assets should include them in command", async () => {
  // Create temporary test files for assets
  const tempDir = await Deno.makeTempDir();
  const linuxBinary = `${tempDir}/binary-linux`;
  const macBinary = `${tempDir}/binary-mac`;
  
  await Deno.writeTextFile(linuxBinary, "linux binary content");
  await Deno.writeTextFile(macBinary, "mac binary content");

  // First, set up assets using set-assets
  await runScript({} as unknown as DeployStepInput, ["set-assets", `${linuxBinary}#Linux Binary`, `${macBinary}#Mac Binary`], []);

  // Then try to create a release - it should pick up the assets from the temp file
  const input = {
    nextVersionName: "v1.2.0",
    gitCurrentBranch: "develop"
  } as unknown as DeployStepInput;

  const { code, stdout } = await runScript(input, ["set"], []);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "Running in test mode, skipping creating GitHub release.");
  assertStringIncludes(stdout, `gh release create v1.2.0 --generate-notes --latest --target develop ${linuxBinary}#Linux Binary ${macBinary}#Mac Binary`);
}); 

Deno.test("set-latest-release alias should work the same as set", async () => {
  const input = {
    nextVersionName: "v1.0.0",
    gitCurrentBranch: "main"
  } as unknown as DeployStepInput;

  // Test with 'set'
  const { stdout: setOutput } = await runScript(input, ["set"], []);

  // Test with 'set-latest-release'
  const { stdout: aliasOutput } = await runScript(input, ["set-latest-release"], []);

  // Both should produce the same output
  assertEquals(setOutput, aliasOutput);
});

Deno.test("no command specified should default to get behavior", async () => {
  const input: GetLatestReleaseStepInput = {
    gitCurrentBranch: "main",
    gitRepoOwner: "levibostian", 
    gitRepoName: "decaf-script-github-releases",
        gitCommitsCurrentBranch: [
      {
        sha: "abc2",
        title: "Release v1.0.0",
        tags: ["v1.0.0"],
        message: "Release v1.0.0",
      }
    ] as unknown as GitCommit[],
    gitCommitsAllLocalBranches: {}
  } as unknown as GetLatestReleaseStepInput;

  // Test with no arguments (should default to 'get')
  const { code, stdout } = await runScript(input, [], [
    { name: "Release v1.0.0", tagName: "v1.0.0" }
  ]);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "Latest git tag on the current branch is: v1.0.0");
  assertStringIncludes(stdout, "latest release found: Release v1.0.0 (v1.0.0)");
});

Deno.test("set-assets command should save assets to temp file", async () => {
  // Create temporary test files for assets
  const tempDir = await Deno.makeTempDir();
  const linuxBinary = `${tempDir}/binary-linux`;
  const macBinary = `${tempDir}/binary-mac`;
  
  await Deno.writeTextFile(linuxBinary, "linux binary content");
  await Deno.writeTextFile(macBinary, "mac binary content");

  // We need a basic input even though this command doesn't use it much
  const input = {} as unknown as DeployStepInput;

  const { code, stdout } = await runScript(input, ["set-assets", `${linuxBinary}#Linux Binary`, `${macBinary}#Mac Binary`], []);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "GitHub Release assets:");
  assertStringIncludes(stdout, `${linuxBinary}#Linux Binary`);
  assertStringIncludes(stdout, `${macBinary}#Mac Binary`);
});

Deno.test("set-github-release-assets alias should work the same as set-assets", async () => {
  // Create temporary test file for asset
  const tempDir = await Deno.makeTempDir();
  const testFile = `${tempDir}/test`;
  
  await Deno.writeTextFile(testFile, "test content");

  const input = {} as unknown as DeployStepInput;

  const { code: code1, stdout: stdout1 } = await runScript(input, ["set-assets", `${testFile}#Test File`], []);
  const { code: code2, stdout: stdout2 } = await runScript(input, ["set-github-release-assets", `${testFile}#Test File`], []);

  assertEquals(code1, 0);
  assertEquals(code2, 0);
  // Both should mention saving assets
  assertStringIncludes(stdout1, "GitHub Release assets:");
  assertStringIncludes(stdout2, "GitHub Release assets:");
});

Deno.test("set-assets command should require at least one asset", async () => {
  const input = {} as unknown as DeployStepInput;

  const { code, stdout } = await runScript(input, ["set-assets"], []);

  assertEquals(code, 1);
  assertStringIncludes(stdout, "Error: set-assets command requires at least one asset argument");
});

Deno.test("set-assets should verify asset files exist before saving", async () => {
  // Create temporary test files
  const tempDir = await Deno.makeTempDir();
  const validFile1 = `${tempDir}/valid-file-1.txt`;
  const validFile2 = `${tempDir}/valid-file-2.bin`;
  const nonExistentFile = `${tempDir}/non-existent.txt`;
  
  await Deno.writeTextFile(validFile1, "test content 1");
  await Deno.writeTextFile(validFile2, "test content 2");
  
  const input = {} as unknown as DeployStepInput;

  // Test with valid files (with and without hash labels)
  const { code: validCode, stdout: validStdout } = await runScript(input, [
    "set-assets", 
    validFile1,  // No hash label
    `${validFile2}#Binary File`  // With hash label
  ], []);

  assertEquals(validCode, 0);
  assertStringIncludes(validStdout, "GitHub Release assets:");
  assertStringIncludes(validStdout, validFile1);
  assertStringIncludes(validStdout, `${validFile2}#Binary File`);

  // Test with non-existent file
  const { code: invalidCode, stdout: invalidStdout } = await runScript(input, [
    "set-assets", 
    nonExistentFile
  ], []);

  assertEquals(invalidCode, 1);
  assertStringIncludes(invalidStdout, `Given asset, ${nonExistentFile}, file does not exist. Cannot proceed.`);

  // Test with directory instead of file
  const { code: dirCode, stdout: dirStdout } = await runScript(input, [
    "set-assets", 
    tempDir  // This is a directory, not a file
  ], []);

  assertEquals(dirCode, 1);
  assertStringIncludes(dirStdout, `Given asset, ${tempDir}, is not a file. Cannot proceed.`);
});

Deno.test("set-assets should handle mixed asset formats (with and without hash)", async () => {
  // Create temporary test files
  const tempDir = await Deno.makeTempDir();
  const binaryFile = `${tempDir}/app.exe`;
  const docFile = `${tempDir}/readme.txt`;
  const configFile = `${tempDir}/config.json`;
  
  await Deno.writeTextFile(binaryFile, "binary content");
  await Deno.writeTextFile(docFile, "documentation");
  await Deno.writeTextFile(configFile, '{"version": "1.0"}');
  
  const input = {} as unknown as DeployStepInput;

  // Test with mix of assets with and without hash labels
  const { code, stdout } = await runScript(input, [
    "set-assets",
    binaryFile,  // No hash
    `${docFile}#Documentation`,  // With hash
    configFile,  // No hash
    `${configFile}#Configuration File`  // Same file with different hash
  ], []);

  assertEquals(code, 0);
  assertStringIncludes(stdout, "GitHub Release assets:");
  assertStringIncludes(stdout, binaryFile);
  assertStringIncludes(stdout, `${docFile}#Documentation`);
  assertStringIncludes(stdout, configFile);
  assertStringIncludes(stdout, `${configFile}#Configuration File`);
});
