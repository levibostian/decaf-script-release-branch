# decaf Script - Release Branch

A script specifically designed for the [decaf](https://github.com/levibostian/decaf) deployment automation tool. This script helps you manage releases on a dedicated "release branch" — keeping your main development branch clean from release metadata commits.

> [!NOTE]  
> This is exclusively for use with decaf. You must use decaf to utilize this script — it's not a standalone tool for general use.

> [!IMPORTANT]  
> This script only works with decaf version [0.13.0](https://github.com/levibostian/decaf/releases/tag/0.13.0) or later.

## What does this script do?

If creating a git tag or GitHub Release is part of your deployment process, you may decide to create these tags on a separate branch (e.g. `latest`, `release`) rather than directly on your development branch (e.g. `main`). This script makes that workflow easy.

It provides two commands:

1. **`get`** — Finds the most recent commit that exists on *both* the current branch (that decaf is running a deployment on) and your configured release branch. Since decaf requires that you find the latest commit on the current branch that corresponds to the latest release, this script helps you find that commit even when your releases are on a different branch.

2. **`set` / `push`** — Checks out the release branch, merges the current branch into it, optionally stages and commits a list of files you specify, pushes, and returns the new HEAD commit SHA on the release branch. Useful to run during the decaf deploy step to make your git tag or GitHub Release on the release branch instead of the current branch.

### Why use a separate release branch?

Some languages/frameworks require that release metadata (e.g. version number) be committed to the repository. Some people may consider these commits to be "noise" on their main development branch or the commits may cause  development annoyance (e.g. merge conflicts). By making those commits on a separate release branch, you can keep your main development branch clean and focused on development work. 

Keeping in mind, some languages like node may not require that you commit release metadata to the repository at all. For node projects, it's common to update your metadata (`package.json`) and then you push all of your code to a npm server. Once deployed, you do not need to commit. You can simply make a git tag on the latest commit on your development branch and move on. So, for languages like this, this script may not be necessary.

## Getting Started

It's important to note that *this script requires that it runs after another script that already found the latest release*. So let's say that your single source of truth for releases is GitHub Releases. You would first run a script that finds the latest GitHub Release ([such as this one](https://github.com/levibostian/decaf-script-github-releases)) and then you run this script by passing the version name and commit SHA from that prior script as command-line arguments.

**GitHub Actions Example**

Here is an example if your release branch is named `latest` and you are using GitHub Releases as your single source of truth for releases:

```yaml
- uses: levibostian/decaf
  with:
    # First get the latest release from GitHub Releases.
    # Then run this script, passing the version name and commit SHA from the previous script as arguments.
    get_latest_release_current_branch: |
      npx @levibostian/decaf-script-github-releases get
      npx @levibostian/decaf-script-release-branch get \
        --release-branch latest \
        --version-name "{{ versionName }}"
    # For deployment, update the metadata file with the new version, then run this script to merge and push to the release branch.
    deploy: |
      echo "{{ nextVersionName }}" > version.txt
      npx @levibostian/decaf-script-release-branch set \
        --release-branch latest \
        --files version.txt \
        --commit-message "chore: bump version to {{ nextVersionName }}"
```

**Command Line Example**

```bash
decaf \
  --get-latest-release-current-branch "npx @levibostian/decaf-script-github-releases get" \
  --get-latest-release-current-branch "npx @levibostian/decaf-script-release-branch get --release-branch latest --version-name '{{ versionName }}'" \
  --deploy "echo '{{ nextVersionName }}' > version.txt" \
  --deploy "npx @levibostian/decaf-script-release-branch set --release-branch latest --files version.txt --commit-message 'chore: bump version to {{ nextVersionName }}'"
```

> [Learn more about decaf's behavior of running multiple scripts for the same deployment step](https://github.com/levibostian/decaf#running-multiple-commands-per-step).

### Alternative Installation Methods

The examples above use `npx` to run the script. Using `npx` is convenient because node is commonly pre-installed on CI environments. However, you can run the script in other ways as well. 

1. **Run with Deno** (requires Deno installed)

```yaml
get_latest_release_current_branch: deno run --allow-all --quiet jsr:@levibostian/decaf-script-release-branch get --release-branch latest --version-name "{{ versionName }}"
deploy: deno run --allow-all --quiet jsr:@levibostian/decaf-script-release-branch set --release-branch latest --files version.txt --commit-message "chore: bump version to {{ nextVersionName }}"
```

2. **Run as a compiled binary**

```yaml
get_latest_release_current_branch: |
  curl -fsSL https://github.com/levibostian/decaf-script-release-branch/blob/HEAD/install?raw=true | bash -s "0.1.0"
  decaf-script-release-branch get --release-branch latest --version-name "{{ versionName }}"
deploy: |
  decaf-script-release-branch set --release-branch latest --files version.txt --commit-message "chore: bump version to {{ nextVersionName }}"
```

# Commands

### `get` — Find the common commit

Used in your *get latest release* step. Finds the most recent commit shared between the current branch and the release branch. The version name of the previous release is passed in as a `--version-name` argument (typically output from a prior script such as one that reads GitHub Releases).

**Exits with error (code 1)** if no common commit is found between the two branches — this indicates a broken repository state.

```bash
# With a previous release
npx @levibostian/decaf-script-release-branch get \
  --release-branch latest \
  --version-name "1.2.3"

# With a different release branch name
npx @levibostian/decaf-script-release-branch get \
  --release-branch releases \
  --version-name "2.0.0"
```

**Options**

| Flag | Required | Description |
|------|----------|-------------|
| `--release-branch` | Yes | The name of the branch where releases live |
| `--version-name` | No | Version name of the previous release (e.g. `1.2.3`). If omitted, the script assumes no prior release exists and exits 0. |

**Output**: `GetLatestReleaseStepOutput { versionName, commitSha }` — `versionName` is passed through from `--version-name`; `commitSha` is the most recent commit shared between both branches.

---

### `set` / `push` — Push to the release branch

Used in your *deploy* step. Checks out the release branch, merges the current branch into it, optionally stages and commits files, and pushes. Returns the new HEAD commit SHA on the release branch.

`--files` and `--commit-message` are both optional. If omitted, no commit is made — but the merge and push still happen, which is useful when another part of your pipeline handles the file changes.

**If you do provide `--files`, you are responsible for writing those files before calling this command.** This script only stages, commits, and pushes them.

```bash
# Merge and push with no commit (just bring the release branch up to date)
npx @levibostian/decaf-script-release-branch set --release-branch latest
npx @levibostian/decaf-script-release-branch push --release-branch latest

# Commit a single file
npx @levibostian/decaf-script-release-branch set \
  --release-branch latest \
  --files version.txt \
  --commit-message "chore: bump version to 1.2.3"

# Commit multiple files (space-separated in one value)
npx @levibostian/decaf-script-release-branch set \
  --release-branch latest \
  --files "version.txt metadata.json" \
  --commit-message "chore: release 1.2.3"

# Commit multiple files (repeated flag)
npx @levibostian/decaf-script-release-branch set \
  --release-branch latest \
  --files version.txt \
  --files metadata.json \
  --commit-message "chore: release 1.2.3"
```

**Options**

| Flag | Required | Description |
|------|----------|-------------|
| `--release-branch` | Yes | The name of the branch where releases live. |
| `--files` | No | File path(s) to stage and commit. Space-separated or repeated. If omitted, no commit is made. |
| `--commit-message` | No | The git commit message. If omitted, no commit is made. |
| `--disable-git-add-force` | No | By default, `git add -f` is used to stage files (so ignored files can be committed). Pass this flag to use plain `git add` instead. |

### Output

`set` / `push` creates new commits that you may need to reference as part of your deployment process.

If a later script needs the latest commit on the release branch, use the **`latest-commit`** command. It prints the raw SHA to stdout, making it easy to capture:

```bash
RELEASE_SHA=$(npx @levibostian/decaf-script-release-branch latest-commit --release-branch latest)
npx @levibostian/decaf-script-github-releases create --tag {{ nextVersionName }} --target "$RELEASE_SHA" --name "Release {{ nextVersionName }}"
```

