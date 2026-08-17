import assert from "assert";
import { parseEther } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { depositMegapoolValidatorScenario } from "../../scenarios/megapool/deposit-validator";
import { exitMegapoolQueueAndAssert } from "../../scenarios/megapool/exit-queue";
import { DEFAULT_BOND, ETHER, prepareMegapoolProtocol } from "./fixtures";

describe("RocketMegapool deposits", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("rejects initialising the megapool factory twice", async () => {
        const current = await load().ensure("current");
        const guardian = await current.context.guardian();
        await expectRevert(
            () => current.contracts.rocketMegapoolFactory.connect(guardian).initialise(),
            "Invalid or outdated network contract",
        );
    });

    it("rejects upgrading a megapool already using the current delegate", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await expectRevert(
            async () => (await current.megapools.proxy("node", "node")).delegateUpgrade(),
            "Already using latest",
        );
    });

    it("rejects manual deployment for an unregistered account", async () => {
        const current = await load().ensure("current");
        const random = await current.context.actor("random");
        await expectRevert(
            () => current.contracts.rocketNodeManager.connect(random).deployMegapool(),
            "Invalid node",
        );
    });

    it("manually deploys a megapool then deposits", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await depositMegapoolValidatorScenario(current, "node");
    });

    it("manually deploys a megapool then deposits multiple validators", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await current.megapools.depositMulti("node", [{}, {}]);
        assert.equal(await (await current.megapools.delegate("node")).getValidatorCount(), 2n);
    });

    it("rejects a multi-deposit with excess ETH", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.megapools.depositMulti("node", [{}, {}], { value: parseEther("8.1") }),
            "Excess bond value supplied",
        );
    });

    it("rejects an empty multi-deposit", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await expectRevert(
            () => current.megapools.depositMulti("node", []),
            "Must perform at least 1 deposit",
        );
    });

    it("uses separately supplied node ETH in a multi-deposit", async () => {
        const current = await load().ensure("current");
        await current.megapools.fundCredit("node", "random", DEFAULT_BOND);
        await current.megapools.depositMulti("node", [{}, {}], { credit: DEFAULT_BOND });
    });

    it("rejects using more credit than exists in a multi-deposit", async () => {
        const current = await load().ensure("current");
        await expectRevert(
            () => current.megapools.depositMulti("node", [{}, {}], { credit: DEFAULT_BOND }),
            "Insufficient credit",
        );
    });

    it("rejects a multi-deposit that does not meet the bond requirement", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await expectRevert(
            () => current.megapools.depositMulti("node", [{}, { bond: 2n * ETHER }]),
            "Bond requirement not met",
        );
    });

    it("supports mixed express-ticket usage in a multi-deposit", async () => {
        const current = await load().ensure("current");
        await current.megapools.provisionExpressTickets("node", 2n);
        await current.megapools.depositMulti("node", [
            {}, { express: true }, { express: true }, {},
        ]);
        assert.equal(await current.nodes.expressTicketCount("node"), 0n);
    });

    it("supports mixed bond amounts after the requirement changes", async () => {
        const current = await load().ensure("current");
        await current.megapools.provisionExpressTickets("node", 2n);
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await current.megapools.depositMulti("node", [
            {}, { express: true }, { bond: 2n * ETHER, express: true }, { bond: 2n * ETHER },
        ]);
    });

    it("uses queue-exit credit after a bond reduction", async () => {
        const current = await load().ensure("current");
        await current.depositPool.fund("bond-reduction-depositor", 84n * ETHER);
        for (let index = 0; index < 4; index++) await current.megapools.deposit("node");
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getActiveValidatorCount(), 4n);
        assert.equal(await megapool.getNodeBond(), 12n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), DEFAULT_BOND);

        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await exitMegapoolQueueAndAssert(current, "node", 3n);
        assert.equal(
            await current.contracts.rocketNodeDeposit.getNodeDepositCredit(await current.nodes.address("node")),
            DEFAULT_BOND,
        );
        await expectRevert(
            () => current.megapools.deposit("node", { bond: 2n * ETHER, credit: 2n * ETHER }),
            "Bond requirement not met",
        );
        await current.megapools.deposit("node", { bond: ETHER, credit: ETHER });
        await current.megapools.deposit("node", { bond: ETHER, credit: ETHER });
        await current.megapools.deposit("node", { bond: 2n * ETHER, credit: 2n * ETHER });
        await expectRevert(
            () => current.megapools.deposit("node", { bond: 2n * ETHER, credit: 2n * ETHER }),
            "Insufficient credit",
        );
    });

    it("uses separately supplied ETH for a single deposit", async () => {
        const current = await load().ensure("current");
        await current.megapools.fundCredit("node", "random", DEFAULT_BOND);
        await current.megapools.deposit("node", { credit: DEFAULT_BOND });
    });

    it("rejects reusing a validator pubkey", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        const megapool = await current.megapools.delegate("node");
        const pubkey = await megapool.getValidatorPubkey(0n);
        const node = await current.context.actor("node");
        await expectRevert(
            () => current.contracts.rocketNodeDeposit.connect(node).deposit(
                DEFAULT_BOND,
                false,
                pubkey,
                `0x${"00".repeat(96)}`,
                `0x${"00".repeat(32)}`,
                { value: DEFAULT_BOND },
            ),
            "Pubkey in use",
        );
    });

    it("uses ETH credit from leaving the queue", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await exitMegapoolQueueAndAssert(current, "node", 0n);
        await current.megapools.deposit("node", { credit: DEFAULT_BOND });
    });

    it("uses ETH credit in a multi-deposit", async () => {
        const current = await load().ensure("current");
        await current.megapools.deposit("node");
        await exitMegapoolQueueAndAssert(current, "node", 0n);
        await current.megapools.depositMulti("node", [{}, {}], { credit: DEFAULT_BOND });
    });

    it("rejects deploying a second megapool for one node", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await expectRevert(() => current.megapools.deploy("node"));
    });

    it("rejects distribution before the first validator exists", async () => {
        const current = await load().ensure("current");
        await current.megapools.deploy("node");
        await expectRevert(() => current.megapools.distribute("node"), "No first validator");
    });
});
