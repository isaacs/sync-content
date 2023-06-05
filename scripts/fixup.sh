#!/usr/bin/env bash

rm -rf dist
mv dist-tmp dist
chmod 0755 dist/mjs/bin.mjs

cat >dist/cjs/package.json <<!EOF
{
  "type": "commonjs"
}
!EOF

cat >dist/mjs/package.json <<!EOF
{
  "type": "module"
}
!EOF
