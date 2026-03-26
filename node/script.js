#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from "node:process";

// Get the version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Get command line arguments (skip node and script name)
const args = process.argv.slice(2);
const argsString = args.length > 0 ? ` ${args.join(' ')}` : '';

// Download and install the binary
try {
    execSync(`curl -fsSL https://github.com/levibostian/decaf-script-github-releases/blob/HEAD/install?raw=true | bash -s "${version}" > /dev/null`, {
        stdio: 'inherit',
        cwd: process.cwd()
    });
} catch (error) {
    console.error('Failed to download binary:', error.message);
    process.exit(1);
}

// Run the binary with arguments
const binaryPath = './decaf-script-github-releases';
try {
    execSync(`${binaryPath}${argsString}`, {
        stdio: 'inherit',
        cwd: process.cwd()
    });
} catch (error) {
    console.error('Failed to run binary:', error.message);
    process.exit(1);
}
