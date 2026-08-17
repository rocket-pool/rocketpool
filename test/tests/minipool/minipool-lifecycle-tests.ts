import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { closeMinipoolScenario } from "../../scenarios/minipool/close-minipool";
import { dissolveMinipoolAndAssert } from "../../scenarios/minipool/dissolve-minipool";
import { distributeMinipoolBalanceAndAssert } from "../../scenarios/minipool/distribute-balance";
import { stakeMinipoolAndAssert } from "../../scenarios/minipool/stake-minipool";

const ONE_DAY = 24n * 60n * 60n;
const BOND = parseEther("16");
const NODE_FEE = parseEther("0.1");

async function prepareNode(minipools: number): Promise<void> {
    const rp131 = await load().ensure("1.3.1");
    await rp131.pdao.settings.network.setNodeFeeRange({
        minimum: NODE_FEE,
        target: NODE_FEE,
        maximum: NODE_FEE,
    });
    await rp131.nodes.register("node");
    await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawal", { confirm: true });
    await rp131.nodes.stakeMinimumRpl("node", { minipools, bond: BOND });
}

async function createAssigned(name: string): Promise<void> {
    const rp131 = await load().ensure("1.3.1");
    await rp131.depositPool.fund(`depositor-${name}`, BOND);
    await rp131.minipools.create(name, { node: "node", bond: BOND });
}

describe("RocketMinipool historical creation", () => {
    before(async () => {
        await load().ensure("1.3.1");
    });

    it("constructs the expected withdrawal credentials", async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(1);
        await rp131.minipools.create("pool", { node: "node", bond: BOND });
        const address = rp131.minipools.get("pool").address;
        assert.equal(
            (await rp131.minipools.withdrawalCredentials("pool")).toLowerCase(),
            `0x010000000000000000000000${address.slice(2)}`.toLowerCase(),
        );
    });

    it("enforces the global capacity and frees it after finalisation", async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(2);
        await createAssigned("pool");
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
        await rp131.pdao.settings.minipools.setMaximumCount(await rp131.minipools.count());
        await expectRevert(
            () => rp131.minipools.create("blocked", { node: "node", bond: BOND }),
            "Global minipool limit reached",
        );
        await distributeMinipoolBalanceAndAssert(rp131, "pool", {
            balance: parseEther("36"),
            caller: "nodeWithdrawal",
            expectedUser: parseEther("17.8"),
            expectedNode: parseEther("18.2"),
            expectedFinalised: true,
        });
        await rp131.depositPool.fund("replacementDepositor", BOND);
        await rp131.minipools.create("replacement", { node: "node", bond: BOND });
    });

    it("rejects creation when the registered delegate is not a contract", async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(1);
        await rp131.odao.bootstrap.upgrade(
            "upgradeContract",
            "rocketMinipoolDelegate",
            "[]",
            await rp131.nodes.address("badDelegate"),
        );
        await expectRevert(
            () => rp131.minipools.create("pool", { node: "node", bond: BOND }),
            "Delegate contract does not exist",
        );
    });

    it("allows minipool creation with a zero minimum RPL stake", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.pdao.settings.nodes.setMinimumRplStakePerMinipool(0n);
        for (let index = 0; index < 5; index++) {
            await rp131.minipools.create(`pool${index}`, { node: "node", bond: parseEther("8") });
        }
        assert.equal(await rp131.nodes.activeMinipoolCount("node"), 5n);
    });
});

describe("RocketMinipool current lifecycle compatibility", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(5);
        await rp131.pdao.settings.minipools.setLaunchTimeout(3n * ONE_DAY);
        await rp131.odao.settings.minipools.setScrubPeriod(ONE_DAY);

        for (const name of ["prelaunch", "prelaunch2", "staking", "dissolved"]) {
            await createAssigned(name);
        }
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("staking");
        await rp131.time.advanceMinipoolLaunchTimeout();
        await rp131.minipools.dissolve("dissolved", { caller: "random" });
        await rp131.upgradeTo("current");
    });

    it("stakes a historical prelaunch minipool", async () => {
        await stakeMinipoolAndAssert(await load().ensure("current"), "prelaunch");
    });

    it("rejects staking with another validator pubkey", async () => {
        const current = await load().ensure("current");
        await expectRevert(() => current.minipools.stake("prelaunch", {
            validatorPubkey: current.minipools.get("prelaunch2").pubkey,
        }));
    });

    it("rejects staking with incorrect withdrawal credentials", async () => {
        const current = await load().ensure("current");
        await expectRevert(() => current.minipools.stake("prelaunch", {
            withdrawalCredentials: `0x${"11".repeat(32)}`,
        }));
    });

    it("rejects staking by a random address", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.stake("prelaunch", { caller: "random" }),
            "Invalid minipool owner",
        );
    });

    it("dissolves a timed-out historical prelaunch minipool", async () => {
        await dissolveMinipoolAndAssert(await load().ensure("current"), "prelaunch", {
            caller: "random",
        });
    });

    it("rejects dissolving a staking minipool", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.dissolve("staking", { caller: "node" }),
            "The minipool can only be dissolved while in prelaunch",
        );
    });

    it("closes a historical dissolved minipool", async () => {
        await closeMinipoolScenario(await load().ensure("current"), {
            minipool: "dissolved",
            caller: "node",
        });
    });

    it("rejects closing a staking minipool or closing as a random address", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.close("staking", { caller: "node" }),
            "The minipool can only be closed while dissolved",
        );
        await expectRevert(
            () => current.minipools.close("dissolved", { caller: "random" }),
            "Invalid minipool owner",
        );
    });

    it("rejects promotion for non-vacant minipools in every state", async () => {
        const current = await load().ensure("current");
        await expectRevert(() => current.minipools.promote("prelaunch"), "Cannot promote a non-vacant minipool");
        for (const name of ["staking", "dissolved"]) {
            await expectRevert(
                () => current.minipools.promote(name),
                "The minipool can only promote while in prelaunch",
            );
        }
    });

    it("rejects ETH sent to non-payable delegate methods", async () => {
        const current = await load().ensure("current");
        const entity = current.minipools.get("prelaunch");
        const signer = await current.context.actor("random");
        const delegate = load().historical.get("1.3.1", "rocketMinipoolDelegate")
            .attach(entity.address).connect(signer) as any;
        await expectRevert(() => delegate.getStatus({ value: parseEther("1") }));
        await expectRevert(() => delegate.refund({ value: parseEther("1") }));
    });
});

describe("RocketMinipool historical initialised state", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(1);
        await rp131.pdao.settings.deposits.setAssignmentsEnabled(false);
        await rp131.minipools.create("pool", { node: "node", bond: BOND });
        await rp131.time.advanceMinipoolScrubPeriod();
    });

    it("rejects staking an initialised minipool", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(
            () => rp131.minipools.stake("pool"),
            "The minipool can only begin staking while in prelaunch",
        );
    });

    it("rejects dissolving an initialised minipool", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(
            () => rp131.minipools.dissolve("pool", { caller: "random" }),
            "The minipool can only be dissolved while in prelaunch",
        );
    });

    it("rejects promoting an initialised minipool", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(
            () => rp131.minipools.promote("pool"),
            "The minipool can only promote while in prelaunch",
        );
    });
});

describe("RocketMinipool dissolution timeout", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await prepareNode(1);
        await createAssigned("pool");
        await rp131.upgradeTo("current");
    });

    it("rejects dissolution before the launch timeout", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.minipools.dissolve("pool", { caller: "random" }),
            "The minipool can only be dissolved once it has timed out",
        );
    });
});
