import assert from "assert";
import { ZeroAddress } from "ethers";

import { before, describe, expectRevert, it, load } from "../../harness";
import { registerNodeAndAssert } from "../../scenarios/node/register-node";
import { setNodeTimezoneAndAssert } from "../../scenarios/node/set-node-timezone";
import { setSmoothingPoolRegistrationAndAssert } from "../../scenarios/node/set-smoothing-pool-registration";
import {
    confirmWithdrawalAddressAndAssert,
    setWithdrawalAddressAndAssert,
} from "../../scenarios/node/set-withdrawal-address";

const ONE_DAY = 24n * 60n * 60n;
const CLAIM_INTERVAL = 28n * ONE_DAY;

describe("RocketNodeManager", () => {
    before(async () => {
        const current = await load().ensure("current");
        await current.pdao.settings.nodes.setSmoothingPoolRegistrationEnabled(true);
        await current.nodes.register("registeredNode1");
        await current.nodes.register("registeredNode2");
        await current.pdao.settings.rewards.setClaimInterval(CLAIM_INTERVAL);
    });

    describe("registration", () => {
        it("lets a node operator register", async () => {
            const current = await load().ensure("current");
            await registerNodeAndAssert(current, { node: "node" });
        });

        it("rejects registration while registrations are disabled", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.nodes.setRegistrationEnabled(false);

            await expectRevert(
                () => registerNodeAndAssert(current, { node: "node" }),
                "Rocket Pool node registrations are currently disabled",
            );
        });

        it("rejects an invalid timezone during registration", async () => {
            const current = await load().ensure("current");

            await expectRevert(
                () => registerNodeAndAssert(current, { node: "node", timezone: "a" }),
                "The timezone location is invalid",
            );
        });

        it("rejects a node which is already registered", async () => {
            const current = await load().ensure("current");
            await registerNodeAndAssert(current, { node: "node" });

            await expectRevert(() => registerNodeAndAssert(current, { node: "node" }));
        });
    });

    describe("withdrawal address", () => {
        it("lets a node operator set their withdrawal address immediately", async () => {
            const current = await load().ensure("current");

            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress1",
                confirm: true,
            });
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress2",
                confirm: true,
                caller: "withdrawalAddress1",
            });
        });

        it("allows multiple node operators to use the same withdrawal address", async () => {
            const current = await load().ensure("current");

            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress1",
                confirm: true,
            });
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode2",
                withdrawalAddress: "withdrawalAddress1",
                confirm: true,
            });
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress2",
                confirm: true,
                caller: "withdrawalAddress1",
            });
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode2",
                withdrawalAddress: "withdrawalAddress2",
                confirm: true,
                caller: "withdrawalAddress1",
            });
        });

        it("rejects an invalid withdrawal address", async () => {
            const current = await load().ensure("current");

            await expectRevert(() => setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: ZeroAddress,
                confirm: true,
            }));
        });

        it("rejects a withdrawal-address change from an unauthorised actor", async () => {
            const current = await load().ensure("current");

            await expectRevert(() => setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress1",
                confirm: true,
                caller: "random",
            }));
        });

        it("lets a node operator set and confirm a pending withdrawal address", async () => {
            const current = await load().ensure("current");

            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress1",
                confirm: false,
            });
            await confirmWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                caller: "withdrawalAddress1",
            });
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress2",
                confirm: false,
                caller: "withdrawalAddress1",
            });
            await confirmWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                caller: "withdrawalAddress2",
            });
        });

        it("rejects withdrawal-address confirmation from the wrong actor", async () => {
            const current = await load().ensure("current");
            await setWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                withdrawalAddress: "withdrawalAddress1",
                confirm: false,
            });

            await expectRevert(() => confirmWithdrawalAddressAndAssert(current, {
                node: "registeredNode1",
                caller: "random",
            }));
        });
    });

    describe("timezone", () => {
        it("lets a node operator change their timezone", async () => {
            const current = await load().ensure("current");
            await setNodeTimezoneAndAssert(current, {
                node: "registeredNode1",
                timezone: "Australia/Sydney",
            });
        });

        it("rejects an invalid timezone", async () => {
            const current = await load().ensure("current");

            await expectRevert(
                () => setNodeTimezoneAndAssert(current, {
                    node: "registeredNode1",
                    timezone: "a",
                }),
                "The timezone location is invalid",
            );
        });

        it("rejects a timezone change from an unregistered actor", async () => {
            const current = await load().ensure("current");

            await expectRevert(() => setNodeTimezoneAndAssert(current, {
                node: "random",
                timezone: "Australia/Brisbane",
            }));
        });
    });

    describe("smoothing pool", () => {
        it("rejects registration while smoothing-pool registrations are disabled", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.nodes.setSmoothingPoolRegistrationEnabled(false);

            await expectRevert(
                () => setSmoothingPoolRegistrationAndAssert(current, {
                    node: "registeredNode1",
                    state: true,
                }),
                "Smoothing pool registrations are not active",
            );
        });

        it("lets a node operator register for the smoothing pool", async () => {
            const current = await load().ensure("current");
            await setSmoothingPoolRegistrationAndAssert(current, {
                node: "registeredNode1",
                state: true,
            });
        });

        it("rejects setting the smoothing-pool state to its current value", async () => {
            const current = await load().ensure("current");

            await expectRevert(
                () => setSmoothingPoolRegistrationAndAssert(current, {
                    node: "registeredNode1",
                    state: false,
                }),
                "Invalid state change",
            );
        });

        it("rejects another smoothing-pool change before a reward interval has passed", async () => {
            const current = await load().ensure("current");
            await setSmoothingPoolRegistrationAndAssert(current, {
                node: "registeredNode1",
                state: true,
            });

            await expectRevert(
                () => setSmoothingPoolRegistrationAndAssert(current, {
                    node: "registeredNode1",
                    state: false,
                }),
                "Not enough time has passed since changing state",
            );
        });

        it("lets a node operator change smoothing-pool state after a reward interval", async () => {
            const current = await load().ensure("current");
            await setSmoothingPoolRegistrationAndAssert(current, {
                node: "registeredNode1",
                state: true,
            });
            await current.time.advance(CLAIM_INTERVAL + 1n);
            await setSmoothingPoolRegistrationAndAssert(current, {
                node: "registeredNode1",
                state: false,
            });
        });
    });

    it("returns node counts grouped by timezone", async () => {
        const current = await load().ensure("current");
        await registerNodeAndAssert(current, {
            node: "random2",
            timezone: "Australia/Sydney",
        });
        await registerNodeAndAssert(current, {
            node: "random3",
            timezone: "Australia/Perth",
        });

        const counts = new Map(
            (await current.nodes.countByTimezone()).map(({ timezone, count }) => [timezone, count]),
        );
        assert.equal(counts.get("Australia/Brisbane"), 2n);
        assert.equal(counts.get("Australia/Sydney"), 1n);
        assert.equal(counts.get("Australia/Perth"), 1n);
    });
});
