#!/bin/sh
cd /c/Dev/Vs_World
name=$(basename "$1" .ts)
node .smoke/bundle.mjs ./.smoke/$name.ts .smoke/dist_$name > /dev/null 2>.smoke/bundle_err.txt || { head -30 .smoke/bundle_err.txt; exit 1; }
node .smoke/dist_$name/$name.js "$2" "$3" "$4" 2>&1 | grep -v "IndexedDB\|^    at \|THREE.Clock"
