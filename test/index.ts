import t from 'tap'

import { spawn } from 'child_process'
import { readFileSync, readlinkSync } from 'fs'
import { dirname, resolve } from 'path'
import { PathScurry } from 'path-scurry'
import { syncContent, syncContentSync } from '../dist/esm/index.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const readFixture = async (fixture: string): Promise<string[]> => {
  const s = new PathScurry(fixture)
  const entries: string[] = []
  for await (const e of s.iterate()) {
    const rp = e.relativePosix()
    entries.push(
      !rp ? './' : (
        rp +
          (e.isDirectory() ? '/'
          : e.isSymbolicLink() ? '@ ' + readlinkSync(e.fullpath())
          : e.isFile() ? '# ' + readFileSync(e.fullpath(), 'utf8')
          : '???')
      ),
    )
  }
  return entries.sort((a, b) => a.localeCompare(b, 'en'))
}

t.test('basic test', async t => {
  const fixture = () => ({
    src: {
      b: {
        link: t.fixture('symlink', 'foo'),
        file: 'asfd',
      },
      nest: {
        x: {
          y: {
            z: 'z',
          },
        },
      },
    },
    matching: {
      b: {
        link: t.fixture('symlink', 'foo'),
        file: 'asfd',
      },
      nest: {
        x: {
          y: {
            z: 'z',
          },
        },
      },
    },
    // content mismatch, test that we don't get fooled by similar names
    s: {
      b: {
        link: t.fixture('symlink', 'file'),
        file: 'dfsa',
      },
      nest: {
        x: {
          y: {
            z: { a: 'a' },
          },
        },
      },
    },
    // partial match, test that we don't get fooled by similar names
    srcpartial: {
      b: {
        link: t.fixture('symlink', 'foo'),
        file: 'asfd',
      },
    },
    diff: {
      b: {
        x: {
          y: {
            z: 'z',
          },
        },
      },
      nest: {
        x: 'z',
        link: t.fixture('symlink', 'foo'),
        file: 'asfd',
      },
    },
    empty: {},
  })
  const root = t.testdir({ sync: fixture(), async: fixture() })
  for (const s of ['sync', 'async']) {
    const dir = resolve(root, s)
    const from = resolve(dir, 'src')
    t.rejects(() => syncContent(from, from))
    t.rejects(() => syncContent(from, dir))
    t.rejects(() => syncContent(dir, from))
    t.rejects(() => syncContent(from, resolve('/')))
    t.rejects(() => syncContent(resolve('/'), from))
    t.throws(() => syncContentSync(from, from))
    t.throws(() => syncContentSync(from, dir))
    t.throws(() => syncContentSync(dir, from))
    t.throws(() => syncContentSync(from, resolve('/')))
    t.throws(() => syncContentSync(resolve('/'), from))
    const expect = await readFixture(from)
    for (const d of [
      'matching',
      'srcpartial',
      'diff',
      'nonexistent',
      'empty',
      's',
    ]) {
      const to = resolve(dir, d)
      t.test(d, async t => {
        if (s === 'async') {
          await syncContent(from, to)
        } else {
          syncContentSync(from, to)
        }
        t.strictSame(await readFixture(to), expect)
      })
    }
  }
})

t.test('bin', async t => {
  const bin = resolve(__dirname, '../dist/esm/bin.mjs')
  const run = async (...args: string[]) => {
    const proc = spawn(process.execPath, [bin, ...args])
    const out: Buffer[] = []
    const err: Buffer[] = []
    proc.stdout.on('data', c => out.push(c))
    proc.stderr.on('data', c => err.push(c))
    return new Promise(res => {
      proc.on('close', (code, signal) =>
        res({
          stdout: Buffer.concat(out).toString(),
          stderr: Buffer.concat(err).toString(),
          code,
          signal,
        }),
      )
    })
  }

  t.match(await run('-h'), {
    stdout: /^Usage:\n/,
    stderr: '',
    code: 0,
    signal: null,
  })
  t.match(await run('--help'), {
    stdout: /^Usage:\n/,
    stderr: '',
    code: 0,
    signal: null,
  })
  t.match(await run('a', 'b', 'c'), {
    stdout: '',
    stderr: /^Usage:\n/,
    code: 1,
    signal: null,
  })
  const dir = t.testdir({
    src: {
      a: {
        b: {
          l: t.fixture('symlink', 'c'),
          c: 'd',
        },
      },
    },
  })
  const src = resolve(dir, 'src')
  const dest = resolve(dir, 'dest')
  t.match(await run(src, dest), {
    stdout: '',
    stderr: '',
    code: 0,
    signal: null,
  })
  const expect = await readFixture(src)
  t.strictSame(await readFixture(dest), expect)
})
