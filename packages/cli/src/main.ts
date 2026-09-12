#!/usr/bin/env node
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { runCli } from './cli'

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

async function readStdin(): Promise<string> {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) raw += chunk as string
  return raw
}

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  tty: process.stdout.isTTY === true,
  version: __CLI_VERSION__,
  exists: existsSync,
  readFile,
  readStdin,
  stdinLines: () => createInterface({ input: process.stdin, crlfDelay: Infinity }),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  fetch: (request) => fetch(request)
})
