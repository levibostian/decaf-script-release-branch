# decaf Script - GitHub Releases

A script specifically designed for the [decaf](https://github.com/levibostian/decaf) deployment automation tool. This script helps you work with GitHub Releases in your continuous deployment workflows.

**Important**: This is exclusively for use with decaf. You must use decaf to utilize this script - it's not a standalone tool for general use.

## What does this script do?

If you use GitHub's Releases feature to store and track the versions that you deploy, this script is for you. When you run decaf and need to specify where to determine successful releases, this script provides that functionality.

This script provides functionality to:

1. **Get the latest release** - Finds the most recent GitHub Release that matches a git tag on the current branch
2. **Set/create a release** - Creates a new GitHub Release with configurable options

# Getting Started

**No installation required!** We just need to tell decaf how to run this script (via `npx`, `deno`, or a compiled binary).

Here are some simple examples for how to run this script with decaf on GitHub Actions or from the command line.

**GitHub Actions Example**

```yaml
- uses: levibostian/decaf
  with:
    get_latest_release_current_branch: npx @levibostian/decaf-script-github-releases get
    deploy: your-script-here && npx @levibostian/decaf-script-github-releases set
    # Other decaf arguments...
```

**Command Line Example**

```bash
decaf \
  --get-latest-release-current-branch "npx @levibostian/decaf-script-github-releases get" \
  --deploy "your-script-here && npx @levibostian/decaf-script-github-releases set"
```

> Note: Replace `your-script-here` with whatever commands you need to run as part of the deployment process before creating the release. Be sure to run the script *last* because once you create the release, decaf will consider the deployment successful and if you re-run decaf, it will not attempt to re-attempt the deployment.

### Alternative Installation Methods

The above examples use `npx` and are arguably the easiest way to run the script. But, you have a few other options too: 

1. **Run with Deno** (requires Deno installed)

```yaml
get_latest_release_current_branch: deno run --allow-all --quiet jsr:@levibostian/decaf-script-github-releases get
deploy: deno run --allow-all --quiet jsr:@levibostian/decaf-script-github-releases set
```

2. **Run as a compiled binary**

Great option that doesn't depend on node or deno. This just installs a binary from GitHub and runs it for your operating system.

```yaml
get_latest_release_current_branch: curl -fsSL https://github.com/levibostian/decaf-script-github-releases/blob/HEAD/install?raw=true | bash -s "0.1.0" && ./decaf-script-github-releases get
deploy: curl -fsSL https://github.com/levibostian/decaf-script-github-releases/blob/HEAD/install?raw=true | bash -s "0.1.0" && ./decaf-script-github-releases set

# Or, always run the latest version (less stable, but always up-to-date)
get_latest_release_current_branch: curl -fsSL https://github.com/levibostian/decaf-script-github-releases/blob/HEAD/install?raw=true | bash && ./decaf-script-github-releases get
```

# Commands

### Get Latest Release

In your *get latest release* script for decaf, use the `get` (or `get-latest-release`) command to fetch the latest GitHub Release for the current branch. 

If your GitHub repository...
- ...has a newer git tag then the latest release, this script will return the release, not the tag. 
- ...has no releases, it will return nothing, indicating that there is no latest release. 
- ...has newer GitHub Releases then the current branch's latest git tag, it will return the older GitHub Release that matches the latest git tag on the current branch.

Example usage:

```bash 
npx @levibostian/decaf-script-github-releases get
```

### Set/Create Release

In your *deploy* script for decaf, use the `set` (or `set-latest-release`) command to create a new GitHub Release for the current branch.

When you run this command, it will:
- Create a new GitHub Release using the new version determined by the decaf get next release version script 
- Upload any assets that you created if you called the `set-assets` command beforehand

Example usage:

```bash
# Use the default settings to create the release
npx @levibostian/decaf-script-github-releases set

# Or, with custom GitHub CLI arguments
npx @levibostian/decaf-script-github-releases set --draft --target {{gitCurrentBranch}}
```

### Set GitHub Release Assets

In your *deploy* script for decaf, use the `set-assets` (or `set-github-release-assets`) command to specify files that should be uploaded when creating a GitHub Release (when you call `set` command).

This command allows you to:
- Specify multiple files to upload as release assets
- Set custom display names for each asset

Example usage:

```bash
# After your deployment script runs, set the assets to upload. 
# Each asset follows the format: `"path/to/file#Display Name"`
npx @levibostian/decaf-script-github-releases set-assets "dist/binary-linux#Linux Binary" "dist/binary-mac#Mac Binary"

# Then create the release (it will automatically include the assets)
npx @levibostian/decaf-script-github-releases set
```


