#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -o errexit

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the Ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi
  # Kill the beacon chain simulator instance that we started (if we started one and if it's still running).
  if [ -n "$beacon_pid" ] && ps -p $beacon_pid > /dev/null; then
    kill -9 $beacon_pid
  fi
}

if [ "$SOLIDITY_COVERAGE" = true ]; then
  ganache_port=8555
else
  ganache_port=8545
fi

# Beacon chain simulator config
beacon_port=9545
deposit_contract_address=0xb50eA9565646e5Ed39688694b283cb185A3CC130
withdrawal_contract_address=0x75261102F55D523718Fa7A1d82111b8fAf3eCE0E
withdrawal_from_address=0xe6ed92d26573c67af5eca7fb2a49a807fb8f88db

ganache_running() {
  nc -z localhost "$ganache_port"
}

start_ganache() {
  if [ "$SOLIDITY_COVERAGE" = true ]; then
    node_modules/.bin/ganache-cli -l 8000000 -e 1000 -m "jungle neck govern chief unaware rubber frequent tissue service license alcohol velvet" --port "$ganache_port" > /dev/null &
  else
    node_modules/.bin/ganache-cli -l 8000000 -e 1000 -m "jungle neck govern chief unaware rubber frequent tissue service license alcohol velvet" > /dev/null &
  fi

  ganache_pid=$!
}

beacon_running() {
  nc -z localhost "$beacon_port"
}

start_beacon() {
  node node_modules/beacon-chain-simulator/beacon/index.js --depositContract $deposit_contract_address --withdrawalContract $withdrawal_contract_address --from $withdrawal_from_address --noDatabase > /dev/null &
  beacon_pid=$!
}

if ganache_running; then
  echo "Using existing Ganache instance"
else
  echo "Starting our own Ganache instance"
  start_ganache
fi

sleep 3

if beacon_running; then
  echo "Using existing beacon chain simulator instance"
else
  echo "Starting our own beacon chain simulator instance"
  start_beacon
fi

if [ "$SOLIDITY_COVERAGE" = true ]; then
  node_modules/.bin/solidity-coverage

  if [ "$CONTINUOUS_INTEGRATION" = true ]; then
    cat coverage/lcov.info | node_modules/.bin/coveralls
  fi
else
  node_modules/.bin/truffle test "$@"
fi
