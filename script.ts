import {
  getLatestReleaseStepInput,
  type GetLatestReleaseStepOutput,
  setLatestReleaseStepOutput,
  getDeployStepInput
} from "@levibostian/decaf-sdk";
import $ from "@david/dax";

interface ScriptDataSavedToFile {
  githubReleaseAssets: string[];
}
const getFileToSaveScriptDataTo = (): string => {
  const tempDir = Deno.env.get("TMPDIR") || Deno.env.get("TMP") || "/tmp";
    const assetsFilePath = `${tempDir}/decaf-script-github-releases-assets.json`;
  return assetsFilePath;
}

export const getLatestReleaseFromGitHubReleases = async (): Promise<GetLatestReleaseStepOutput | null> => {
  const input = getLatestReleaseStepInput();

  const latestGitTagCommit = input.gitCommitsCurrentBranch.filter((commit) => commit.tags?.length)[0]
  if (!latestGitTagCommit) {
    console.log("No git tags found on the current branch. Therefore, there has never been a release on this branch.");
    return null
  }

  const latestGitTag = latestGitTagCommit!.tags![0];

  console.log(`Latest git tag on the current branch is: ${latestGitTag}`);

  const latestReleasesGitHubJsonString = Deno.env.get("MOCK_GITHUB_RELEASES") || await $`gh release list --exclude-drafts --order desc --json name,tagName`.text()
  const latestReleasesGitHub = JSON.parse(latestReleasesGitHubJsonString) as { name: string; tagName: string }[];

  if (!latestReleasesGitHub.length) {
    console.log(`No GitHub Releases found in the GitHub repository. Perhaps this is a mistake, since there is a git tag on the current branch but no GitHub Release for that tag? I suggest making a GitHub Release for the git tag, ${latestGitTag}, and then re-running the deployment.`);
    return null
  }

  const latestRelease = latestReleasesGitHub.find((release) => release.tagName === latestGitTag);

  if (!latestRelease) {
    console.log(`No GitHub Release found for the latest git tag on the current branch, ${latestGitTag}. Perhaps this is a mistake? I suggest making a GitHub Release for the git tag, ${latestGitTag}, and then re-running the deployment.`);
    return null
  }

  console.log(
    `latest release found: ${latestRelease.name} (${latestRelease.tagName})`,
  );

  const commitMatchingRelease = input.gitCommitsCurrentBranch.find((commit) => {
    return commit.tags?.includes(latestRelease.tagName);
  })!;

  console.log(
    `commit matching release found: ${commitMatchingRelease.title} (${commitMatchingRelease.sha})`,
  );

  return {
    versionName: latestRelease.name,
    commitSha: commitMatchingRelease.sha,
  }
}

export const createGitHubRelease = async (customArgs: string[] = []): Promise<void> => {
  const input = getDeployStepInput();
  
  // Get assets from temp file created by set-assets command
  let githubReleaseAssets: string[] = [];
  try {
    const assetsFilePath = getFileToSaveScriptDataTo();
    const assetsData: ScriptDataSavedToFile = JSON.parse(await Deno.readTextFile(assetsFilePath));
    githubReleaseAssets = assetsData.githubReleaseAssets || [];
  } catch {
    // No temp file or error reading it, continue with empty assets
  }
  
  // Get current branch from input
  const currentBranch = input.gitCurrentBranch;
  
  let argsToCreateGithubRelease: string[];
  
  if (customArgs.length > 0) {
    // User provided custom arguments, use them directly
    argsToCreateGithubRelease = [
      'release',
      'create',
      input.nextVersionName,
      ...customArgs,
      ...githubReleaseAssets,
    ];
  } else {
    // Use default arguments
    argsToCreateGithubRelease = [
      'release',
      'create', 
      input.nextVersionName,
      '--generate-notes',
      '--latest',
      '--target',
      currentBranch,
      ...githubReleaseAssets,
    ];
  }

  if (input.testMode) {
    console.log("Running in test mode, skipping creating GitHub release.");
    console.log(`Command to create GitHub release: gh ${argsToCreateGithubRelease.join(" ")}`);
  } else {
    await $`gh ${argsToCreateGithubRelease}`.printCommand();
  }
}

export const setGitHubReleaseAssets = async (assets: string[]): Promise<void> => {  
  // Verify all asset paths exist
  for (const asset of assets) {
    const assetPath = asset.split("#")[0];
    try {
      const stat = await Deno.stat(assetPath);
      if (!stat.isFile) {
        console.error(`Given asset, ${assetPath}, is not a file. Cannot proceed.`);
        Deno.exit(1);
      }
    } catch {
      console.error(`Given asset, ${assetPath}, file does not exist. Cannot proceed.`);
      Deno.exit(1);
    }
  }

  // Get the temporary directory
  const assetsFilePath = getFileToSaveScriptDataTo();
  
  // Create the assets data
  const assetsData: ScriptDataSavedToFile = {
    githubReleaseAssets: assets
  };
  
  // Write to temp file
  try {
    await Deno.writeTextFile(assetsFilePath, JSON.stringify(assetsData, null, 2));
    console.log(`GitHub Release assets: ${assets.join(", ")} saved to be referenced later when creating a release.`);
  } catch (error) {
    console.error(`Failed to write assets file: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

function showHelp() {
  console.log(`
Usage: 
  script.ts get                           # Get the latest release (default behavior)
  script.ts set [args...]                 # Set/create a GitHub release
  script.ts set-assets <asset1> [asset2...]  # Set GitHub release assets
  script.ts get-latest-release            # Alias for 'get'
  script.ts set-latest-release [args...]  # Alias for 'set'
  script.ts set-github-release-assets <asset1> [asset2...]  # Alias for 'set-assets'

Commands:
  get, get-latest-release                Get the latest GitHub release that matches a git tag on the current branch
  set, set-latest-release                Create a new GitHub release
  set-assets, set-github-release-assets  Set GitHub release assets for future release creation

Examples:
  # Get latest release
  script.ts get
  script.ts get-latest-release

  # Create release with default settings
  script.ts set
  script.ts set-latest-release

  # Create release with custom arguments
  script.ts set --generate-notes --latest --target main
  script.ts set-latest-release --draft --notes "Custom release notes"

  # Set assets for future release
  script.ts set-assets "dist/binary-linux#Linux Binary" "dist/binary-mac#Mac Binary"
  script.ts set-github-release-assets "docs/manual.pdf#User Manual"
`);
}

if (import.meta.main) {
  // Check for help flag
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    showHelp();
    Deno.exit(0);
  }

  const command = Deno.args.length > 0 ? Deno.args[0] : "get";
  const commandArgs = Deno.args.slice(1);

  switch (command) {
    case "get":
    case "get-latest-release": {
      const latestRelease = await getLatestReleaseFromGitHubReleases();
      if (latestRelease) {
        setLatestReleaseStepOutput(latestRelease);
      }
      break;
    }
    case "set":
    case "set-latest-release": {
      await createGitHubRelease(commandArgs);
      break;
    }
    case "set-assets":
    case "set-github-release-assets": {
      if (commandArgs.length === 0) {
        console.error("Error: set-assets command requires at least one asset argument");
        console.error("Usage: script.ts set-assets <asset1> [asset2...]");
        console.error("Asset format: path#name (e.g., 'dist/binary#Binary File')");
        
        Deno.exit(1);
      }
      await setGitHubReleaseAssets(commandArgs);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      showHelp();
      Deno.exit(1);
    }
  }
}