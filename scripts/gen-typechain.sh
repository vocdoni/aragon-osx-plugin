#!/bin/bash

FILES=""
for f in $(find ./artifacts -name "*.json"); do
  if [[ $f != *.dbg.json ]] && [[ $f != *build-info* ]]; then
    FILES="$FILES $f"
  fi
done

typechain --target ethers-v5 --out-dir ./typechain $FILES
