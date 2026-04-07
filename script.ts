import {
  getLatestReleaseStepInput,
  type GetLatestReleaseStepOutput,
  setLatestReleaseStepOutput,
  getDeployStepInput,
} from "@levibostian/decaf-sdk";
import { parseArgs } from "@std/cli/parse-args";
import $ from "@david/dax";

// ============================================================================
// get command
//
// Finds the most recent commit that exists on both the current branch and the
// configured release branch. This is how we determine what commit was the
// "base" of the last release, without assuming anything about how tags or
// GitHub Releases are managed.
//
// The versionName of the previous release is passed in via
// --version-name CLI argument. If it is absent, there
// is no previous release and the command exits 0 without writing output.
// ============================================================================

export const getCommonCommitOnReleaseBranch = (
  releaseBranch: string,
  previousVersionName: string,
): GetLatestReleaseStepOutput | null => {
  const input = getLatestReleaseStepInput();

  const commitsForReleaseBranch = input.gitCommitsAllLocalBranches[releaseBranch] || []
  const commitsForCurrentBranch = input.gitCommitsCurrentBranch

  const latestCommitOnBothBranches = commitsForReleaseBranch.find((commit) =>
    commitsForCurrentBranch.some((currentCommit) => currentCommit.sha === commit.sha)
  )

  if (!latestCommitOnBothBranches) {
    console.log(`No commits found that are present on both '${releaseBranch}' and current branch.`)
    console.log("This shouldn't happen, so exiting early with error to avoid creating a broken release.")
    Deno.exit(1) // No commits found that are present on both branches, exit early without writing output.
  }

  console.log(`Found most recent common commit on both '${releaseBranch}' and current branch: 
    ${latestCommitOnBothBranches.title} (${latestCommitOnBothBranches.abbreviatedSha})`)

  const output: GetLatestReleaseStepOutput = {
    versionName: previousVersionName,
    commitSha: latestCommitOnBothBranches.sha,
  }

  return output
};

// ============================================================================
// set command
//
// Checks out the release branch, merges the current branch into it, writes an
// arbitrary file (caller-specified via --file and --content), commits, pushes,
// and returns the commit SHA of the new commit on the release branch.
// ============================================================================

export const pushToReleaseBranch = async ({
  releaseBranch,
  filesToCommitPaths,
  commitMessage,
  disableGitAddForce = false,
}: {
  releaseBranch: string;
  filesToCommitPaths?: string[];
  commitMessage?: string;
  disableGitAddForce?: boolean;
}): Promise<{commitSha: string}> => {
  const input = getDeployStepInput();

  const currentBranch = input.gitCurrentBranch;

  // Checkout the release branch and pull the latest commits.
  await $`git checkout ${releaseBranch}`.printCommand();
  await $`git pull --no-rebase origin ${releaseBranch}`.printCommand();

  // Merge the current (development) branch into the release branch.
  // Prefer fast-forward, but allow a merge commit if the histories have
  // diverged (e.g. after a rebase).
  await $`git merge --ff ${currentBranch}`.printCommand();

  // Only stage and commit if both files and a commit message were provided.
  // Do not throw on error because there is a scenario where we previously made this commit but we failed and retried the deployment.
  // This should only fail if there is no change to commit, which is fine.
  if (filesToCommitPaths && filesToCommitPaths.length > 0 && commitMessage) {
    const gitAddArgs = disableGitAddForce ? filesToCommitPaths : ["-f", ...filesToCommitPaths];
    await $`git add ${gitAddArgs}`.printCommand().noThrow();
    await $`git commit -m ${commitMessage}`.printCommand().noThrow();
    console.log("Showing the most recent commit to aid debugging:");
    await $`git show HEAD`.printCommand();
  } else {
    console.log("No files or commit message provided — skipping commit.");
  }

  if (input.testMode) {
    console.log(
      "Test mode is enabled — skipping git push.",
    );
  } else {
    await $`git push`.printCommand();
  }

  const commitSha = (await $`git rev-parse HEAD`.text()).trim();

  console.log(`Release branch commit SHA: ${commitSha}`);

  return {
    commitSha,
  };
};

// ============================================================================
// latest-commit command
//
// Prints the latest commit SHA on the release branch to stdout.
// ============================================================================

export const getLatestCommitOnReleaseBranch = async (
  releaseBranch: string,
): Promise<string> => {
  const commitSha = (await $`git rev-parse ${releaseBranch}`.text()).trim();
  console.log(commitSha);
  return commitSha;
};

// ============================================================================
// CLI
// ============================================================================

function showHelp() {
  console.log(`
Usage:
  get --release-branch <branch> --version-name <name>
  set --release-branch <branch> [--files <paths>] [--commit-message <msg>]
  latest-commit --release-branch <branch>

Commands:
  get          Find the most recent commit shared between the current branch and the
               release branch. 

  set | push   Check out the release branch, merge the current branch into it,
               optionally commit file changes, push, and print the new HEAD commit
               SHA on the release branch.
  latest-commit   Print the latest commit SHA on the release branch to stdout.

Options:
  --release-branch <branch>    (required) Name of the branch used for releases.
  --version-name <name>        (get only) Version name of the previous release (e.g. "1.2.3").
  --files <paths>              (set only, optional) Space-separated file paths to stage
                               and commit. Can also be repeated:
                                 --files file1.txt --files file2.txt
                                 --files "file1.txt file2.txt"
                               If omitted, no commit is made.
  --commit-message <msg>       (set only, optional) Git commit message.
                               If omitted, no commit is made.
  --disable-git-add-force      (set only, optional) Disable the default -f flag
                               passed to git add.

Examples:
  script.ts get --release-branch latest
  script.ts get --release-branch latest --version-name 1.2.3
  script.ts get --release-branch releases --version-name v2.0.0

  script.ts set --release-branch latest
  script.ts push --release-branch latest
  script.ts set --release-branch latest --files version.txt --commit-message "chore: bump version"
  script.ts set --release-branch latest --files "dist/a.txt dist/b.txt" --commit-message "chore: release"
  script.ts set --release-branch latest --files dist/a.txt --files dist/b.txt --commit-message "chore: release"

  script.ts latest-commit --release-branch latest
`);
}

if (import.meta.main) {
  const parsedArgs = parseArgs(Deno.args, {
    boolean: ["help", "disable-git-add-force"],
    string: ["release-branch", "version-name", "commit-message"],
    collect: ["files"],
    alias: { h: "help" },
  });

  if (parsedArgs.help) {
    showHelp();
    Deno.exit(0);
  }

  const command = String(parsedArgs._[0] ?? "");
  if (!command) {
    console.error("Error: a command is required (get, set, push)");
    showHelp();
    Deno.exit(1);
  }

  const releaseBranch = parsedArgs["release-branch"];
  if (!releaseBranch) {
    console.error("Error: --release-branch is required");
    showHelp();
    Deno.exit(1);
  }

  switch (command) {
    case "get": {
      const versionName = parsedArgs["version-name"];

      if (!versionName) {
        console.log(
          `Looks like none of the previous scripts found a latest release. That means there is nothing for me to do, since my job is to find the common commit between the current branch and the release branch.`
        )
        Deno.exit(0);
      }

      const result = getCommonCommitOnReleaseBranch(releaseBranch, versionName);
      if (result) {
        setLatestReleaseStepOutput(result);
      }
      break;
    }
    case "set":
    case "push": {
      // --files can be repeated (collect) giving string[], or a single space-separated value.
      const rawFiles = (parsedArgs["files"] ?? []) as string[];
      const filesToCommitPaths = rawFiles
        .flatMap((f) => f.split(" "))
        .map((f) => f.trim())
        .filter(Boolean);
      const commitMessage = parsedArgs["commit-message"];

      await pushToReleaseBranch({
        releaseBranch,
        filesToCommitPaths: filesToCommitPaths.length > 0 ? filesToCommitPaths : undefined,
        commitMessage,
        disableGitAddForce: parsedArgs["disable-git-add-force"],
      });
      break;
    }
    case "latest-commit": {
      await getLatestCommitOnReleaseBranch(releaseBranch);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      showHelp();
      Deno.exit(1);
    }
  }
}
