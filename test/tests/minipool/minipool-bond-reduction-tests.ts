import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { reduceBondAndAssert } from "../../scenarios/minipool/reduce-bond";

const ONE_DAY = 24n * 60n * 60n;
const WINDOW_START = 2n * ONE_DAY;
const WINDOW_LENGTH = 2n * ONE_DAY;
const BOND_16 = parseEther("16");
const BOND_8 = parseEther("8");

describe("RocketMinipool historical bond reduction", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.odao.settings.minipools.setBondReductionWindowStart(WINDOW_START);
        await rp131.odao.settings.minipools.setBondReductionWindowLength(WINDOW_LENGTH);
        await rp131.nodes.register("node");
        await rp131.nodes.register("trustedNode");
        await rp131.odao.members.bootstrap("trustedNode", {
            id: "trusted",
            url: "node@home.com",
        });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 4, bond: BOND_16 });

        await rp131.depositPool.fund("poolDepositor", BOND_16);
        await rp131.minipools.create("pool", { node: "node", bond: BOND_16 });
        await rp131.depositPool.fund("prelaunchDepositor", BOND_16);
        await rp131.minipools.create("prelaunch", { node: "node", bond: BOND_16 });
        await rp131.pdao.settings.deposits.setAssignmentsEnabled(false);
        await rp131.minipools.create("initialised", { node: "node", bond: BOND_16 });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
    });

    it("reduces a 16 ETH bond to 8 ETH with complete accounting", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.minipools.beginBondReduction("pool", BOND_8);
        await rp131.time.advanceMinipoolBondReductionWindowStart();
        await reduceBondAndAssert(rp131, "pool");
    });

    it("rejects reduction before the waiting period", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.minipools.beginBondReduction("pool", BOND_8);
        await expectRevert(() => rp131.minipools.reduceBond("pool"), "Wait period not satisfied");
    });

    it("rejects reduction after the window expires", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.minipools.beginBondReduction("pool", BOND_8);
        await rp131.time.advancePastMinipoolBondReductionWindow();
        await expectRevert(() => rp131.minipools.reduceBond("pool"), "Wait period not satisfied");
    });

    it("rejects reduction without first beginning", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(() => rp131.minipools.reduceBond("pool"), "Wait period not satisfied");
    });

    it("rejects invalid and increased bond targets", async () => {
        const rp131 = await load().ensure("1.3.1");
        await expectRevert(
            () => rp131.minipools.beginBondReduction("pool", parseEther("9")),
            "Invalid bond amount",
        );
        await expectRevert(
            () => rp131.minipools.beginBondReduction("pool", parseEther("18")),
            "Invalid bond amount",
        );
    });

    it("rejects beginning reduction for non-staking minipools", async () => {
        const rp131 = await load().ensure("1.3.1");
        for (const name of ["prelaunch", "initialised"]) {
            await expectRevert(
                () => rp131.minipools.beginBondReduction(name, BOND_8),
                "Minipool must be staking",
            );
        }
    });

    it("prevents beginning after the oDAO cancels reduction", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.minipools.cancelBondReduction("pool", { caller: "trustedNode" });
        assert.equal((await rp131.minipools.bondReduction("pool")).cancelled, true);
        await expectRevert(
            () => rp131.minipools.beginBondReduction("pool", BOND_8),
            "This minipool is not allowed to reduce bond",
        );
    });

    it("prevents completion after the oDAO cancels reduction", async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.minipools.beginBondReduction("pool", BOND_8);
        await rp131.time.advanceMinipoolBondReductionWindowStart();
        await rp131.minipools.cancelBondReduction("pool", { caller: "trustedNode" });
        await expectRevert(
            () => rp131.minipools.reduceBond("pool"),
            "This minipool is not allowed to reduce bond",
        );
    });
});

describe("RocketMinipool historical fee accounting", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.odao.settings.minipools.setBondReductionWindowStart(WINDOW_START);
        await rp131.odao.settings.minipools.setBondReductionWindowLength(WINDOW_LENGTH);
        await rp131.nodes.register("node");
        await rp131.pdao.settings.network.setNodeFeeRange({
            minimum: parseEther("0.2"),
            target: parseEther("0.2"),
            maximum: parseEther("0.2"),
        });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 3, bond: BOND_16 });
        for (const name of ["pool1", "pool2"]) {
            await rp131.depositPool.fund(`${name}Depositor`, BOND_16);
            await rp131.minipools.create(name, { node: "node", bond: BOND_16 });
        }
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool1");
        await rp131.minipools.stake("pool2");
        await rp131.pdao.settings.network.setNodeFeeRange({
            minimum: parseEther("0.1"),
            target: parseEther("0.1"),
            maximum: parseEther("0.1"),
        });
    });

    it("updates the weighted average node fee after bond reduction", async () => {
        const rp131 = await load().ensure("1.3.1");
        assert.equal(await rp131.nodes.averageFee("node"), parseEther("0.2"));
        await rp131.minipools.beginBondReduction("pool1", BOND_8);
        await rp131.time.advanceMinipoolBondReductionWindowStart();
        await reduceBondAndAssert(rp131, "pool1");
        assert.equal(await rp131.nodes.averageFee("node"), parseEther("0.14"));
    });

    const cases = [
        {
            name: "keeps a constant average fee for equal commissions",
            steps: [
                { fee: "0.1", bond: "8", expected: "0.1" },
                { fee: "0.1", bond: "8", expected: "0.1" },
                { fee: "0.1", bond: "16", expected: "0.1" },
            ],
        },
        {
            name: "weights mixed commissions by borrowed ETH",
            steps: [
                { fee: "0.1", bond: "16", expected: "0.1" },
                { fee: "0.2", bond: "8", expected: "0.16" },
                { fee: "0.2", bond: "8", expected: "0.175" },
            ],
        },
    ] as const;

    for (const testCase of cases) {
        it(testCase.name, async () => {
            const rp131 = await load().ensure("1.3.1");
            await rp131.nodes.register("feeNode");
            await rp131.nodes.stakeMinimumRpl("feeNode", { minipools: 10, bond: BOND_8 });
            for (const [index, step] of testCase.steps.entries()) {
                const fee = parseEther(step.fee);
                await rp131.pdao.settings.network.setNodeFeeRange({ minimum: fee, target: fee, maximum: fee });
                const bond = parseEther(step.bond);
                await rp131.depositPool.fund(`feeDepositor${index}`, parseEther("32"));
                await rp131.minipools.create(`feePool${index}`, { node: "feeNode", bond });
                await rp131.time.advanceMinipoolScrubPeriod();
                await rp131.minipools.stake(`feePool${index}`);
                assert.equal(await rp131.nodes.averageFee("feeNode"), parseEther(step.expected));
            }
        });
    }
});
