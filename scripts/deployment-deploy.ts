#!/usr/bin/env -S deno run --quiet --allow-all --no-lock

import $ from "@david/dax";
import { getDeployStepInput } from "@levibostian/decaf-sdk"

const input = getDeployStepInput()

const githubReleaseAssets: string[] = []

const compileBinary = async ({ denoTarget, outputFileName }: { denoTarget: string; outputFileName: string }) => {
  // Create dist directory if it doesn't exist
  await $`mkdir -p dist`.printCommand()
  await $`OUTPUT_FILE_NAME=dist/${outputFileName} DENO_TARGET=${denoTarget} deno task compile`.printCommand()

  githubReleaseAssets.push(`dist/${outputFileName}#${outputFileName}`)
}

// --------------------------------------------------------------------------------
// Compile binaries for different platforms
// --------------------------------------------------------------------------------
await compileBinary({
  denoTarget: "x86_64-unknown-linux-gnu",
  outputFileName: "bin-x86_64-Linux",
})

await compileBinary({
  denoTarget: "aarch64-unknown-linux-gnu",
  outputFileName: "bin-aarch64-Linux",
})

await compileBinary({
  denoTarget: "x86_64-apple-darwin",
  outputFileName: "bin-x86_64-Darwin",
})

await compileBinary({
  denoTarget: "aarch64-apple-darwin",
  outputFileName: "bin-aarch64-Darwin",
})

await $`deno ${[
  `run`,
  `--quiet`,
  `--allow-all`,
  `script.ts`,
  `set-github-release-assets`,
  ...githubReleaseAssets
]}`.printCommand()

// ---------------------------------------------------------------------------------
// Publish the deno module to jsr
// ---------------------------------------------------------------------------------
const argsToDenoPublish = [
  "publish",
  "--set-version",
  input.nextVersionName,
  "--allow-dirty"
]

if (input.testMode) {
  argsToDenoPublish.push("--dry-run")
}

// https://github.com/dsherret/dax#providing-arguments-to-a-command
await $`deno ${argsToDenoPublish}`.printCommand()

// ---------------------------------------------------------------------------------
// Publish the package to npm
// ---------------------------------------------------------------------------------
// update the package.json version before we build as build will define the package we push. 

console.log(`Updating node package version to ${input.nextVersionName}...`)
await $`npm version ${input.nextVersionName} --no-git-tag-version`.cwd("./node").printCommand() 
// assert the version was updated correctly. grep will exit with code 1 if it doesn't find the string
await $`cat node/package.json | grep '"version": "${input.nextVersionName}"'`

// https://github.com/dsherret/dax#providing-arguments-to-a-command
const argsToPushToNpm = [
  `publish`,
  `node/`
]

if (input.testMode) {
  argsToPushToNpm.push(`--dry-run`)
} 

const nameOfNpmPackage = (await $`npm pkg get name`.cwd("./node").text()).trim().replace(/"/g, "")
const didAlreadyDeployToNpm = (await $`npx is-it-deployed --package-manager npm --package-name ${nameOfNpmPackage} --package-version 0.1.0`.cwd("./node").noThrow()).code === 0

if (didAlreadyDeployToNpm) {
  console.log(`npm package ${input.nextVersionName} is already deployed. Skipping pushing to npm`)  
} else {
  await $`npm ${argsToPushToNpm}`.printCommand()
}

// ---------------------------------------------------------------------------------
// Create the GitHub Release
// ---------------------------------------------------------------------------------

await $`deno ${[
  `run`,
  `--quiet`,
  `--allow-all`,
  `script.ts`,
  `set-latest-release`,
  `--generate-notes`,
  `--latest`,
  `--target`,
  `${input.gitCurrentBranch}`
]}`.printCommand()

