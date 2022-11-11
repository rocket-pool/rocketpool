#!/bin/bash

npx truffle compile --all
slither --ignore-compile --filter-paths node_modules,old --exclude conformance-to-solidity-naming-conventions .