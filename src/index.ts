import { glob, globSync } from 'glob'
import { mkdirp, mkdirpSync } from 'mkdirp'
import constants from 'node:constants'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  linkSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs'
import {
  chmod,
  copyFile,
  link,
  readFile,
  readlink,
  symlink,
} from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { Path, PathScurry } from 'path-scurry'
import { rimraf, rimrafSync } from 'rimraf'

const mkdirpClobber = async (dir: string) => {
  try {
    return await mkdirp(dir)
  } catch (e) {
    await mkdirpClobber(dirname(dir))
    await rimraf(dir)
    return await mkdirp(dir)
  }
}

const mkdirpClobberSync = (dir: string) => {
  try {
    return mkdirpSync(dir)
  } catch (e) {
    mkdirpClobberSync(dirname(dir))
    rimrafSync(dir)
    return mkdirpSync(dir)
  }
}

const syncFile = async (src: Path, dest: Path) => {
  // only sync files, dirs, and symlinks
  // Creating these is a pain to test cross platform
  /* c8 ignore start */
  if (!(src.isSymbolicLink() || src.isDirectory() || src.isFile())) {
    if (!dest.isENOENT()) await rimraf(dest.fullpath())
    return
  }
  /* c8 ignore stop */

  if (src.isSymbolicLink()) {
    const target = await readlink(src.fullpath())
    if (!dest.isENOENT()) {
      const dp = dest.isSymbolicLink() && (await readlink(dest.fullpath()))
      if (dp === target) return
      await rimraf(dest.fullpath())
    }
    await mkdirpClobber(dirname(dest.fullpath()))
    await symlink(target, dest.fullpath())
    /* c8 ignore start */
    if (constants.O_SYMLINK && src.mode) {
      try {
        await chmod(dest.fullpath(), src.mode)
      } catch {}
    }
    /* c8 ignore stop */
    return
  }

  if (src.isDirectory()) {
    if (!dest.isDirectory()) {
      await mkdirpClobber(dest.fullpath())
    }
  } else {
    // must be file
    let write = true
    if (!dest.isENOENT() && !dest.isFile()) await rimraf(dest.fullpath())
    else if (await contentMatch(src, dest)) write = false
    if (write) {
      await mkdirpClobber(dirname(dest.fullpath()))
      // platform specific
      /* c8 ignore start */
      await link(src.fullpath(), dest.fullpath()).catch(() =>
        copyFile(src.fullpath(), dest.fullpath())
      )
      /* c8 ignore stop */
    }
  }
  const mode = src.mode
  /* c8 ignore start */
  if (!mode) return
  /* c8 ignore stop */
  await chmod(dest.fullpath(), mode)
}

const syncFileSync = (src: Path, dest: Path) => {
  // only sync files, dirs, and symlinks
  // Creating these is a pain to test cross platform
  /* c8 ignore start */
  if (!(src.isSymbolicLink() || src.isDirectory() || src.isFile())) {
    if (!dest.isENOENT()) rimrafSync(dest.fullpath())
    return
  }
  /* c8 ignore stop */

  if (src.isSymbolicLink()) {
    const target = readlinkSync(src.fullpath())
    if (!dest.isENOENT()) {
      const dp = dest.isSymbolicLink() && readlinkSync(dest.fullpath())
      if (dp === target) return
      rimrafSync(dest.fullpath())
    }
    mkdirpClobberSync(dirname(dest.fullpath()))
    symlinkSync(target, dest.fullpath())
    /* c8 ignore start */
    if (constants.O_SYMLINK && src.mode) {
      try {
        chmodSync(dest.fullpath(), src.mode)
      } catch {}
    }
    /* c8 ignore stop */
    return
  }

  if (src.isDirectory()) {
    if (!dest.isDirectory()) {
      mkdirpClobberSync(dest.fullpath())
    }
  } else {
    // must be file
    let write = true
    if (!dest.isENOENT() && !dest.isFile()) rimrafSync(dest.fullpath())
    else if (contentMatchSync(src, dest)) write = false
    if (write) {
      mkdirpClobberSync(dirname(dest.fullpath()))
      // platform specific
      /* c8 ignore start */
      try {
        linkSync(src.fullpath(), dest.fullpath())
      } catch {
        copyFileSync(src.fullpath(), dest.fullpath())
      }
      /* c8 ignore stop */
    }
  }
  const mode = src.mode
  /* c8 ignore start */
  if (!mode) return
  /* c8 ignore stop */
  chmodSync(dest.fullpath(), mode)
}

const contentMatch = async (src: Path, dest: Path) => {
  try {
    return (
      createHash('sha512')
        .update(await readFile(src.fullpath()))
        .digest('hex') ===
      createHash('sha512')
        .update(await readFile(dest.fullpath()))
        .digest('hex')
    )
    // we should only be doing this if we know it's a valid file already
    // but just in case we can't read it, that's not a match.
    /* c8 ignore start */
  } catch {
    return false
  }
  /* c8 ignore stop */
}

const contentMatchSync = (src: Path, dest: Path) => {
  try {
    return (
      createHash('sha512')
        .update(readFileSync(src.fullpath()))
        .digest('hex') ===
      createHash('sha512')
        .update(readFileSync(dest.fullpath()))
        .digest('hex')
    )
    // we should only be doing this if we know it's a valid file already
    // but just in case we can't read it, that's not a match.
    /* c8 ignore start */
  } catch {
    return false
  }
  /* c8 ignore stop */
}

// if a is a parent of b, or b is a parent of a, then one of them
// will not start with .. in the relative path.
const dots = `..${sep}`
const dirsRelated = (a: string, b: string):boolean => {
  if (a === b) return true
  const relab = relative(a, b)
  const relba = relative(a, b)
  if (!relab.startsWith(dots) || !relba.startsWith(dots)) return true
  return false
}

export const syncContent = async (from: string, to: string) => {
  const scurry = new PathScurry(from)
  const rfrom = resolve(from)
  const rto = resolve(to)
  if (dirname(rfrom) === rfrom || dirname(rto) === rto) {
    throw new Error('cannot sync root directory')
  }
  /* c8 ignore start */
  if (dirsRelated(rto, rfrom)) {
    /* c8 ignore stop */
    throw new Error('cannot copy directory into itself or its parent')
  }
  const [src, dest] = await Promise.all([
    await glob('**', { scurry, withFileTypes: true }),
    await glob('**', { cwd: rto, withFileTypes: true }),
  ])
  await Promise.all([
    ...src.map(async s => {
      /* c8 ignore start */
      if (!s.parent) throw new Error('cannot sync root directory')
      /* c8 ignore stop */
      const d = s.resolve(resolve(rto, s.relative()))
      const parent = d.parent
      /* c8 ignore start */
      if (!parent) throw new Error('cannot sync root directory')
      /* c8 ignore stop */
      await d.lstat()
      await mkdirpClobber(parent.fullpath())
      await syncFile(s, d)
    }),
    ...dest.map(async d => {
      const s = scurry.cwd.resolve(resolve(rfrom, d.relative()))
      await s.lstat()
      if (s.isENOENT()) {
        // race
        /* c8 ignore start */
        try {
          await rimraf(d.fullpath())
        } catch {}
        /* c8 ignore stop */
      }
    }),
  ])
}

export const syncContentSync = (from: string, to: string) => {
  const scurry = new PathScurry(from)
  const rfrom = resolve(from)
  const rto = resolve(to)
  if (dirname(rfrom) === rfrom || dirname(rto) === rto) {
    throw new Error('cannot sync root directory')
  }
  if (dirsRelated(rto, rfrom)) {
    throw new Error('cannot copy directory into itself or its parent')
  }
  const [src, dest] = [
    globSync('**', { scurry, withFileTypes: true }),
    globSync('**', { cwd: rto, withFileTypes: true }),
  ]
  for (const s of src) {
    /* c8 ignore start */
    if (!s.parent) throw new Error('cannot sync root directory')
    /* c8 ignore stop */
    const d = s.resolve(resolve(rto, s.relative()))
    const parent = d.parent
    /* c8 ignore start */
    if (!parent) throw new Error('cannot sync root directory')
    /* c8 ignore stop */
    d.lstatSync()
    mkdirpClobberSync(parent.fullpath())
    syncFileSync(s, d)
  }
  for (const d of dest) {
    const s = scurry.cwd.resolve(resolve(rfrom, d.relative()))
    s.lstatSync()
    if (s.isENOENT()) {
      // race
      /* c8 ignore start */
      try {
        rimrafSync(d.fullpath())
      } catch {}
      /* c8 ignore stop */
    }
  }
}
