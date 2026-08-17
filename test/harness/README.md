# Version-aware test harness

The harness provides opt-in replacements for Mocha's `describe`, `before`, and
`it`. A suite's `before` hooks build its baseline. Every test runs against a
fresh EVM snapshot and a cloned metadata context. Nested suites inherit their
parent’s baseline and can refine it without leaking state to siblings.

The harness deploys v1.3.1 once per test run. Each root suite receives an
isolated snapshot and context cloned from that shared historical baseline, then
applies any requested upgrades independently.

```ts
import { before, describe, it, load } from "./harness";

describe("legacy minipool", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");

        await rp131.nodes.register("alice");
        await rp131.nodes.stakeMinimumRpl("alice", {
            minipools: 1,
            bond: ethers.parseEther("8"),
        });
        await rp131.depositPool.fund("depositor", ethers.parseEther("24"));
        await rp131.minipools.create("pool", {
            node: "alice",
            bond: ethers.parseEther("8"),
        });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.upgradeTo("1.4");
    });

    it("uses the 1.4 interface", async () => {
        const rp14 = await load().ensure("1.4");
        await rp14.minipools.stake("pool");
    });
});
```

## Release views

`ensure()` returns a release-specific TypeScript interface and does not perform
an implicit version transition in an initialized scope. `upgradeTo()` executes
the supported upgrade edges and returns the destination interface.
Each view connects active addresses with that release's generated bindings;
the current view does not inherit v1.4 contract types.

High-level actions on an old view fail after an upgrade. Intentional access to a
superseded address is available through:

```ts
const oldManager = load().historical.get("1.3.1", "rocketMinipoolManager");
```

The `current` interface deliberately has no `minipools.create` operation.
Tests requiring a minipool under current must create it through the appropriate
historical lifecycle and upgrade that state forward.

Minipool creation metadata records the protocol release that created the pool,
but delegate state is always read from the proxy. `minipools.delegate(name)`
returns the effective delegate's numeric contract version together with its
stored, previous, and effective addresses and `useLatest` setting. Delegate
bindings are selected by that numeric version rather than the active protocol
release.

Named actors can also be used for current protocol actions without sharing
signer globals:

```ts
const current = await load().ensure("current");
await current.pdao.settings.nodes.setSmoothingPoolRegistrationEnabled(true);
await current.nodes.register("alice");
await current.nodes.setWithdrawalAddress("alice", "alice-withdrawal", {
    confirm: true,
});
```

DAO settings are namespaced by their owning DAO because pDAO and oDAO have
independent, overlapping settings domains:

```ts
await current.pdao.settings.nodes.setRegistrationEnabled(false);
const scrubPeriod = await current.odao.settings.minipools.getScrubPeriod();
```

Transaction methods use the named node as caller. Withdrawal-address changes
also accept a `caller` option because the storage API separates the target node
from the authorising address. Common failure assertions can use `expectRevert`.

Fee distributors use the same named nodes and actors:

```ts
await current.nodes.initialiseFeeDistributor("alice");
await current.distributors.fund("alice", "funder", ethers.parseEther("1"));
await current.distributors.distribute("alice", { caller: "anyone" });
```

Test-only contracts belong to the harness context rather than a protocol
release. Deploy fixtures during setup and retrieve a fresh typed handle after
snapshot restoration:

```ts
const ctx = load();
const current = await ctx.ensure("current");
const receiver = await ctx.fixtures.revertingReceiver.deploy("withdrawal");
await current.nodes.setWithdrawalAddress("alice", receiver.address, {
    confirm: true,
});

// In a test:
const restored = load().fixtures.revertingReceiver.get("withdrawal");
await restored.setEnabled(false);
```

Reusable test workflows live beside the tests rather than in the harness:

```text
test/
├── harness/
├── scenarios/
│   ├── minipool/
│   └── node/
└── tests/
    ├── minipool/
    └── node/
```

A `*Scenario` function accepts an explicit typed protocol view, performs a
common workflow, asserts invariants shared by every invocation, and returns
observations for test-specific assertions. Scenarios do not define hooks or
call `load()` internally.

## Harness architecture

`protocol.ts` is the stable public entry point for release views, contract
types, and connection helpers. Its implementation is split under `protocol/`:

```text
protocol/
├── contracts.ts
├── connections.ts
├── releases.ts
├── view.ts
└── domains/
    ├── deposit-pool.ts
    ├── distributors.ts
    ├── minipools.ts
    ├── nodes.ts
    ├── odao.ts
    ├── pdao.ts
    └── time.ts
```

Domain modules own their actions and private helpers. Release views compose the
domains available in each protocol version, while connections centrally map
deployed addresses to versioned TypeChain bindings. `ProtocolContext` imports
connections at runtime and imports release views only as types, keeping the
module graph free of runtime cycles.

## Historical artifacts

Normal test runs do not compile old Solidity sources or operate a Git
submodule. The committed release directories contain compact Hardhat artifacts,
source commits, compiler versions, and SHA-256 integrity information.

To rebuild a bundle, compile a clean checkout of the matching tag and run:

```sh
node scripts/build-test-release-bundle.js 1.3.1 /path/to/compiled/v1.3.1 test/harness/releases/v1.3.1
npx typechain --target ethers-v6 --out-dir test/harness/bindings/v1_3_1 \
  'test/harness/releases/v1.3.1/artifacts/*.json'
```

Run `npm run test:types` and `npm run test:integration` after rebuilding.

Current working-tree bindings change with normal protocol development. Refresh
them after changing a contract ABI with:

```sh
npm run harness:generate-current
```

The command compiles the working tree, validates the maintained artifact
lists, and replaces only `test/harness/bindings/current` and
`test/harness/bindings/fixtures`.

## Legacy migration coverage

The retired JavaScript files remain in `test-old/` for comparison while the
version-aware suite in `test/` is canonical. "Ported" means the behavior has a
corresponding test in the new suite, Solidity tests, or isolated JavaScript
unit tests; it does not mean the legacy source has been removed.

| Legacy source | New location | Status |
| --- | --- | --- |
| `test-old/rocket-pool-tests.js` | `test/tests/rocket-pool-tests.ts` | Ported |
| `test-old/auction/auction-tests.js` | `test/tests/auction/auction-tests.ts` | Ported |
| `test-old/dao/dao-node-trusted-tests.js` | `test/tests/odao/node-trusted-tests.ts` | Ported |
| `test-old/dao/dao-protocol-tests.js` | `test/tests/pdao/protocol-tests.ts` | Ported |
| `test-old/dao/dao-protocol-treasury-tests.js` | `test/tests/pdao/treasury-tests.ts` | Ported |
| `test-old/dao/dao-security-tests.js` | `test/tests/pdao/security-tests.ts` | Ported |
| `test-old/deposit/deposit-pool-tests.js` | `test/tests/deposit/deposit-pool-tests.ts` | Ported |
| `test-old/megapool/megapool-tests.js` | `test/tests/megapool/*-tests.ts` | Ported; 122 legacy cases split by domain |
| `test-old/minipool/minipool-tests.js` | `test/tests/minipool/minipool-lifecycle-tests.ts` and `minipool-bond-reduction-tests.ts` | Ported |
| `test-old/minipool/minipool-status-tests.js` | `test/tests/minipool/minipool-lifecycle-tests.ts` and `minipool-delegate-tests.ts` | Ported |
| `test-old/minipool/minipool-scrub-tests.js` | `test/tests/minipool/minipool-scrub-tests.ts` | Ported |
| `test-old/minipool/minipool-vacant-tests.js` | `test/tests/minipool/minipool-vacant-tests.ts` | Ported |
| `test-old/minipool/minipool-withdrawal-tests.js` | `test/tests/minipool/minipool-withdrawal-tests.ts` | Ported |
| `test-old/network/network-balances-tests.js` | `test/tests/network/network-balances-tests.ts` | Ported |
| `test-old/network/network-prices-tests.js` | `test/tests/network/network-prices-tests.ts` | Ported |
| `test-old/network/network-voting-tests.js` | `test/tests/network/network-voting-tests.ts` | Ported |
| `test-old/network/network-fees-tests.js` | `test-solidity/network/RocketNetworkFees.t.sol` | Ported to Solidity |
| `test-old/network/network-revenues-tests.js` | `test-solidity/network/RocketNetworkRevenues.t.sol` | Ported to Solidity |
| `test-old/network/network-snapshots-tests.js` | `test-solidity/network/RocketNetworkSnapshots.t.sol` | Ported to Solidity |
| `test-old/node/node-distributor-tests.js` | `test/tests/node/node-distributor-tests.ts` | Ported |
| `test-old/node/node-manager-tests.js` | `test/tests/node/node-manager-tests.ts` | Ported |
| `test-old/node/node-staking-tests.js` | `test/tests/node/node-staking-tests.ts` | Ported |
| `test-old/rewards/rewards-tests.js` | `test/tests/rewards/rewards-tests.ts` | Ported |
| `test-old/token/reth-tests.js` | `test/tests/token/reth-tests.ts` | Ported |
| `test-old/token/rpl-tests.js` | `test/tests/token/rpl-tests.ts` | Ported |
| `test-old/util/util-tests.js` | `test-solidity/util/LinkedListStorage.t.sol` | Ported to Solidity |
| `test-old/util/verifier-tests.js` | `test-unit/util/verifier-tests.js` | Ported as an isolated JavaScript unit suite |
| v1.4 `test-upgrade` suite | `test/tests/upgrade/v1-4/` | Ported from the historical branch |
| v1.5 upgrade settings/version checks | `test/tests/upgrade/v1-5/settings-tests.ts` | Ported |
