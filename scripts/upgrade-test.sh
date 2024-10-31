#!/bin/bash

# Point hardhat at local node
export PROVIDER_URL=http://localhost:8545
export MNEMONIC="test test test test test test test test test test test junk"
export MNEMONIC_PASSWORD=
export ROCKET_STORAGE=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# Start local hardhat node
trap 'kill $(lsof -t -i:8545)' EXIT
npx hardhat node &>/dev/null &
sleep 10

# Init submodule
#git submodule update --init

# Install deps and build
cd old
#npm install
npx hardhat compile

# Deploy the old version
npx hardhat run scripts/deploy.js --network testnet

# Move to project root
cd ..

# Run upgrade test suite
npx hardhat test --network testnet --config hardhat-upgrade.config.js --bail