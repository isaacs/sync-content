#!/usr/bin/env node
//@ts-ignore
process.setSourceMapsEnabled(true)

import { syncContent } from './index.js'

const usage = () => `Usage:

  sync-content <from> <to>

Syncs the file, directory, and symlink structure from 'from' path to 'to' path,
skipping any entries that do not differ from their source.`

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(usage())
  process.exit(0)
}

const [_, __, from, to] = process.argv
if (process.argv.length !== 4 || !from || !to) {
  console.error(usage())
  process.exit(1)
}

await syncContent(from, to)
