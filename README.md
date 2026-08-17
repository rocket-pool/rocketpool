<picture>
  <img alt="Rocket Pool - Decentralised Ethereum Liquid Staking Protocol" src="https://raw.githubusercontent.com/rocket-pool/.github/main/assets/logo.svg" width="auto" height="120">
</picture>

# Rocket Pool - Decentralised Ethereum Liquid Staking Protocol

Rocket Pool is a decentralized Ethereum liquid staking protocol. It lets people participate in Ethereum staking without needing to run a full validator with 32 ETH, and it also lowers the technical barrier for running nodes. Here’s a breakdown:

### For Regular Stakers
- Users can stake as little as 0.01 ETH by depositing into Rocket Pool’s smart contracts
- In return, they receive rETH (Rocket Pool ETH), a liquid staking token that automatically accrues staking rewards over time
- rETH can be traded, used in DeFi, or redeemed for ETH + rewards

### For Node Operators
- People who want to run validator nodes can join Rocket Pool by staking 8 ETH (instead of the full 32 ETH)
- Rocket Pool pairs that 8 ETH with the ETH deposited by rETH users to make a full validator
- They earn consensus rewards (ETH) plus commission from the rETH users for running the node

### Why It’s Different
- Lower capital requirement, 8 ETH instead of 32 ETH
- Better yield than solo staking for node operators
- Decentralized alternative to centralized exchanges’ staking services
- Permissionless: anyone can run a node, no approval required
- rETH token means stakers don’t have their ETH locked; they can use rETH across DeFi

Learn more at [https://rocketpool.net](https://rocketpool.net).

# Test Rocket Pool

<picture>
  <img src="https://raw.githubusercontent.com/rocket-pool/rocketpool/master/images/rocket-pool-atlas-test.png?raw=true" alt="Rocket Pool - Testing Ethereum Proof-of-Stake (PoS) Infrastructure Service and Pool for Ethereum 2.0 Beacon Chain"/>
</picture>

The repository requires Node.js 22. Install dependencies and run every test
layer with:

```bash
npm install
npm test
```

The test layers can also be run independently:

```bash
npm run test:solidity
npm run test:unit:javascript
npm run test:integration
npm run test:types
npm run test:legacy
```

Solidity unit tests live in `test-solidity`, and isolated JavaScript unit tests
live in `test-unit`. The canonical version-aware TypeScript integration suite,
its harness, and historical release bundles live in `test`. The retired
JavaScript integration suite remains available in `test-old` through
`npm run test:legacy`, but is not part of the default `npm test` run.

After contract ABIs change, regenerate the current harness bindings with:

```bash
npm run harness:generate-current
```

Having issues? Have an idea? Interested in research?

Our friendly community are available to help via our discord.

<a target="_blank" href="https://discord.gg/rocketpool">
  <img src="https://dcbadge.limes.pink/api/server/https://discord.gg/rocketpool">
</a>
