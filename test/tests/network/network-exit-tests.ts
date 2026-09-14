import assert from "node:assert/strict";
import { parseEther, type ContractTransactionReceipt } from "ethers";

import { asNetworkContract, before, describe, expectRevert, it, load, type ProtocolCurrent } from "../../harness";
import {
    RocketMegapoolDelegate__factory,
    RocketMinipoolDelegate__factory,
} from "../../harness/bindings/current";
import { WithdrawalRequestPredeployMock__factory, type WithdrawalRequestPredeployMock } from "../../harness/bindings/fixtures";
import { distributeMinipoolBalanceAndAssert } from "../../scenarios/minipool/distribute-balance";
import { submitMinipoolPenaltyScenario } from "../../scenarios/network/submit-minipool-penalty";
import { applyMegapoolPenaltyVoteAndAssert } from "../../scenarios/megapool/apply-penalty";
import { dissolveMegapoolValidatorAndAssert } from "../../scenarios/megapool/dissolve-validator";
import { distributeMegapoolRewardsAndAssert } from "../../scenarios/megapool/distribute-rewards";
import { finaliseMegapoolValidatorAndAssert } from "../../scenarios/megapool/finalise-validator";
import { notifyMegapoolExitAndAssert } from "../../scenarios/megapool/notify-exit";
import { currentEpoch, FAR_FUTURE_EPOCH, slotProof } from "../../scenarios/megapool/proofs";
import { stakeMegapoolValidatorAndAssert } from "../../scenarios/megapool/stake-validator";
import { ethers, network } from "../../../test-old/_utils/hardhat-runtime";
import { prepareMegapoolProtocol } from "../megapool/fixtures";

const ETHER = 10n ** 18n;
const EXIT_WAIT = 114n;
const EPOCH_SECONDS = 32n * 12n;
const WITHDRAWAL_REQUEST_PREDEPLOY = "0x00000961Ef480Eb55e80D19ad83579A64c007002";

async function assertFullExitRequests(
    predeploy: WithdrawalRequestPredeployMock,
    caller: string,
    pubkeys: string[],
    fee: bigint,
): Promise<void> {
    // Assert every request in the last transaction, including all requests in a batch.
    const requests = await predeploy.queryFilter(predeploy.filters.WithdrawalRequestQueued(), "latest", "latest");
    assert.equal(requests.length, pubkeys.length);
    for (const [index, request] of requests.entries()) {
        assert.equal(request.args.caller, caller);
        assert.equal(request.args.pubkey, pubkeys[index]);
        assert.equal(request.args.amount, 0n, "Full exits must use consensus FULL_EXIT_REQUEST_AMOUNT (zero)");
        assert.equal(request.args.value, fee);
    }
    const rawRequest = await predeploy.lastRequest();
    assert.equal(ethers.getBytes(rawRequest).length, 56);
    // Independent byte-level expectation: a 48-byte pubkey followed by eight zero bytes.
    assert.equal(rawRequest, `${pubkeys[pubkeys.length - 1]}0000000000000000`);
}

function legacyValidatorProof(pubkey: string, exitEpoch = FAR_FUTURE_EPOCH) {
    return {
        validatorIndex: 0n,
        validator: {
            pubkey,
            withdrawalCredentials: ethers.ZeroHash,
            effectiveBalance: 0n,
            slashed: false,
            activationEligibilityEpoch: FAR_FUTURE_EPOCH,
            activationEpoch: FAR_FUTURE_EPOCH,
            exitEpoch,
            withdrawableEpoch: FAR_FUTURE_EPOCH,
        },
        witnesses: [],
    };
}

async function setNextBlockTimestamp(timestamp: bigint): Promise<void> {
    await network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
}

async function penaliseLegacyMinipool(
    current: ProtocolCurrent,
    minipoolName: string,
    slotTimestamp: bigint,
    options: { pubkey?: string; exitEpoch?: bigint } = {},
): Promise<ContractTransactionReceipt> {
    const minipool = current.minipools.get(minipoolName);
    const caller = await current.context.actor("random");
    const transaction = await current.contracts.rocketNetworkExit.connect(caller).penaliseMinipool(
        minipool.address,
        slotTimestamp,
        legacyValidatorProof(options.pubkey ?? minipool.pubkey, options.exitEpoch),
        slotProof(0n),
    );
    const receipt = await transaction.wait();
    assert(receipt, "Minipool penalty transaction was not mined");
    return receipt;
}

async function penaliseAfterCooperativePhase(
    current: ProtocolCurrent,
    minipoolName: string,
): Promise<ContractTransactionReceipt> {
    const minipoolAddress = current.minipools.get(minipoolName).address;
    const requestTime = await current.contracts.rocketNetworkExit
        .getMinipoolCooperativeExitStart(minipoolAddress);
    const phase = await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
    const penaltyTime = requestTime + phase;
    await setNextBlockTimestamp(penaltyTime);
    return penaliseLegacyMinipool(current, minipoolName, penaltyTime);
}

function minipoolPenaltyAmount(
    networkExit: ProtocolCurrent["contracts"]["rocketNetworkExit"],
    receipt: ContractTransactionReceipt,
): bigint {
    for (const log of receipt.logs) {
        try {
            const parsed = networkExit.interface.parseLog(log);
            if (parsed?.name === "MinipoolPenalised") return parsed.args._amount;
        } catch {
            // Ignore logs emitted by other contracts in the transaction.
        }
    }
    assert.fail("MinipoolPenalised event was not emitted");
}

async function legacyPenaltyState(current: ProtocolCurrent, minipoolName: string) {
    const minipoolAddress = current.minipools.get(minipoolName).address;
    const networkExit = current.contracts.rocketNetworkExit;
    return {
        penaltyRate: await current.minipools.penaltyRate(minipoolName),
        requestedEth: await networkExit.getRequestedEth(),
        expectedUserCapital: await networkExit.getMinipoolExpectedUserCapital(minipoolAddress),
        cooperativeExitStart: await networkExit.getMinipoolCooperativeExitStart(minipoolAddress),
        requestCount: await networkExit.getMinipoolExitRequestCount(minipoolAddress),
        lastExit: await networkExit.getMinipoolLastExit(minipoolAddress),
    };
}

function calculateUnpenalisedNodeShare(
    details: Awaited<ReturnType<ProtocolCurrent["minipools"]["details"]>>,
    balance: bigint,
): bigint {
    const capital = details.nodeDepositBalance + details.userDepositBalance;
    if (balance > capital) {
        const rewards = balance - capital;
        const nodeRewards = rewards * details.nodeDepositBalance / capital;
        const userRewards = rewards - nodeRewards;
        return details.nodeDepositBalance + nodeRewards + userRewards * details.nodeFee / ETHER;
    }
    if (balance > details.userDepositBalance) return balance - details.userDepositBalance;
    return 0n;
}

async function installWithdrawalRequestPredeploy(fee: bigint) {
    const [guardian] = await ethers.getSigners();
    const implementation = await new WithdrawalRequestPredeployMock__factory(guardian).deploy();
    await implementation.waitForDeployment();
    const runtimeCode = await ethers.provider.getCode(await implementation.getAddress());
    await network.provider.send("hardhat_setCode", [WITHDRAWAL_REQUEST_PREDEPLOY, runtimeCode]);
    const predeploy = WithdrawalRequestPredeployMock__factory.connect(
        WITHDRAWAL_REQUEST_PREDEPLOY,
        guardian,
    );
    await (await predeploy.reset()).wait();
    await (await predeploy.setFee(fee)).wait();
    return predeploy;
}

async function requestMegapoolExit(current: ProtocolCurrent, validatorId: bigint): Promise<void> {
    await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
        await (await current.contracts.rocketNetworkExit.connect(signer).requestMegapoolExit(
            await current.megapools.address("node"),
            validatorId,
        )).wait();
    });
}

async function requestMinipoolExit(current: ProtocolCurrent, minipoolAddress: string): Promise<void> {
    await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
        await (await current.contracts.rocketNetworkExit.connect(signer).requestMinipoolExit(
            minipoolAddress,
        )).wait();
    });
}

async function prepareStakingMegapool(current: ProtocolCurrent, count: number): Promise<void> {
    await current.depositPool.fund("depositor", 28n * ETHER * BigInt(count));
    for (let validatorId = 0n; validatorId < BigInt(count); validatorId++) {
        await current.megapools.deposit("node");
        await stakeMegapoolValidatorAndAssert(current, "node", validatorId);
    }
}

describe("RocketNetworkExit megapool accounting", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("restricts requests and rejects duplicate or invalid validators", async () => {
        const current = await load().ensure("current");
        await prepareStakingMegapool(current, 1);
        const megapoolAddress = await current.megapools.address("node");
        const random = await current.context.actor("random");

        await expectRevert(
            () => current.contracts.rocketNetworkExit.connect(random).requestMegapoolExit(megapoolAddress, 0n),
            "Invalid megapool exit requester",
        );
        await requestMegapoolExit(current, 0n);
        await expectRevert(
            () => requestMegapoolExit(current, 0n),
            "Validator exit already tracked",
        );
        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await expectRevert(
                () => current.contracts.rocketNetworkExit.connect(signer).requestMegapoolExit(megapoolAddress, 1n),
                "Validator does not exist",
            );
        });

        assert.equal(await current.contracts.rocketNetworkExit.getMegapoolExitType(megapoolAddress, 0n), 1n);
        assert.equal(await current.contracts.rocketNetworkExit.getMegapoolExpectedUserCapital(megapoolAddress, 0n), 28n * ETHER);
        assert.equal(await current.contracts.rocketNetworkExit.getRequestedEth(), 28n * ETHER);
        assert.equal(await current.contracts.rocketNetworkExit.getMegapoolOutstandingExitCount(megapoolAddress), 1n);
    });

    it("snapshots cumulative requested and voluntary amounts and reconciles each exactly once", async () => {
        const current = await load().ensure("current");
        await prepareStakingMegapool(current, 4);
        const networkExit = current.contracts.rocketNetworkExit;
        const megapoolAddress = await current.megapools.address("node");

        await requestMegapoolExit(current, 0n);
        assert.equal(await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, 0n), 28n * ETHER);

        // A later bond-curve change does not alter the first snapshot
        // It does affect the marginal calculation for newly classified exits while including the existing exit
        await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
        await notifyMegapoolExitAndAssert(current, "node", 1n, await currentEpoch(current) + EXIT_WAIT);
        assert.equal(await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, 0n), 28n * ETHER);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 1n), 2n);
        assert.equal(await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, 1n), 30n * ETHER);
        assert.equal(await networkExit.getRequestedEth(), 28n * ETHER);
        assert.equal(await networkExit.getVoluntaryEth(), 30n * ETHER);
        assert.equal(await networkExit.getMegapoolOutstandingExitCount(megapoolAddress), 2n);

        // Cooperative notification preserves the existing requested classification
        await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current) + EXIT_WAIT);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 0n), 1n);
        assert.equal(await networkExit.getRequestedEth(), 28n * ETHER);

        await current.time.advance(EXIT_WAIT * EPOCH_SECONDS);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        assert.equal(await networkExit.getRequestedEth(), 0n);
        assert.equal(await networkExit.getVoluntaryEth(), 30n * ETHER);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 0n), 0n);
        assert.equal(await networkExit.getMegapoolOutstandingExitCount(megapoolAddress), 1n);

        await finaliseMegapoolValidatorAndAssert(current, "node", 1n, 32n * ETHER);
        assert.equal(await networkExit.getVoluntaryEth(), 0n);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 1n), 0n);
        assert.equal(await networkExit.getMegapoolOutstandingExitCount(megapoolAddress), 0n);
    });

    it("rejects direct lifecycle accounting calls outside the megapool manager", async () => {
        const current = await load().ensure("current");
        await prepareStakingMegapool(current, 1);
        const megapoolAddress = await current.megapools.address("node");
        const random = await current.context.actor("random");
        await expectRevert(
            () => current.contracts.rocketNetworkExit.connect(random).notifyMegapoolExit(megapoolAddress, 0n),
            "Invalid megapool manager",
        );
        await expectRevert(
            () => current.contracts.rocketNetworkExit.connect(random).notifyMegapoolFinalBalance(megapoolAddress, 0n),
            "Invalid megapool manager",
        );
    });
});

describe("RocketNetworkExit megapool triggered exits", () => {
    before(async () => {
        await prepareMegapoolProtocol();
    });

    it("queries the network-wide EIP-7002 fee and validates the response", async () => {
        const current = await load().ensure("current");
        const predeploy = await installWithdrawalRequestPredeploy(7n);

        assert.equal(await current.contracts.rocketNetworkExit.getExitFee(), 7n);

        await (await predeploy.setRevertFeeQuery(true)).wait();
        await expectRevert(
            () => current.contracts.rocketNetworkExit.getExitFee(),
            "Withdrawal fee query failed",
        );
        await (await predeploy.setRevertFeeQuery(false)).wait();
        await (await predeploy.setMalformedFeeResponse(true)).wait();
        await expectRevert(
            () => current.contracts.rocketNetworkExit.getExitFee(),
            "Invalid withdrawal fee response",
        );
    });

    it("validates predeploy request length and fees but accepts nonzero withdrawal amounts", async () => {
        const current = await load().ensure("current");
        const caller = await current.context.actor("random");
        const fee = 7n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const pubkey = `0x${"11".repeat(48)}`;
        const data = `${pubkey}ffffffffffffffff`;
        for (const invalidData of [data.slice(0, -2), `${data}00`]) {
            await expectRevert(
                () => caller.sendTransaction({ to: WITHDRAWAL_REQUEST_PREDEPLOY, data: invalidData, value: fee }),
                "Invalid request length",
            );
        }
        await expectRevert(
            () => caller.sendTransaction({ to: WITHDRAWAL_REQUEST_PREDEPLOY, data, value: fee - 1n }),
            "Insufficient request fee",
        );
        assert.equal(await predeploy.requestCount(), 0n);

        // The real predeploy accepts this request, but its nonzero amount does not signal a full exit.
        await (await caller.sendTransaction({ to: WITHDRAWAL_REQUEST_PREDEPLOY, data, value: fee + 1n })).wait();
        const requests = await predeploy.queryFilter(predeploy.filters.WithdrawalRequestQueued(), "latest", "latest");
        assert.equal(requests.length, 1);
        assert.equal(requests[0].args.caller, await caller.getAddress());
        assert.equal(requests[0].args.pubkey, pubkey);
        assert.equal(requests[0].args.amount, (1n << 64n) - 1n);
        assert.equal(requests[0].args.value, fee + 1n);
        assert.equal(await predeploy.requestCount(), 1n);
        assert.equal(await predeploy.lastRequest(), data);
    });

    it("forces a requested exit with the exact fee, refunds excess, and retains accounting", async () => {
        const current = await load().ensure("current");
        const fee = 7n;
        const refund = 11n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 1);
        const networkExit = current.contracts.rocketNetworkExit;
        const networkExitAddress = await networkExit.getAddress();
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");
        const currentMegapool = RocketMegapoolDelegate__factory.connect(megapoolAddress, random);
        const receiver = await current.context.fixtures.revertingReceiver.deploy("exitFeeReceiver");
        await receiver.setEnabled(false);

        await requestMegapoolExit(current, 0n);
        await expectRevert(
            () => networkExit.connect(random).forceMegapoolExit(megapoolAddress, 0n, { value: fee }),
            "Not enough time has passed",
        );
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());
        await expectRevert(
            () => networkExit.connect(random).forceMegapoolExit(megapoolAddress, 0n, { value: fee - 1n }),
            "Insufficient exit fee",
        );
        await expectRevert(
            () => currentMegapool.forceExit(0n, { value: fee }),
            "Invalid or outdated contract",
        );

        const megapoolBalanceBefore = await ethers.provider.getBalance(megapoolAddress);
        const requestData = networkExit.interface.encodeFunctionData("forceMegapoolExit", [megapoolAddress, 0n]);
        await receiver.call(networkExitAddress, requestData, fee + refund);

        const validator = await megapool.getValidatorInfo(0n);
        assert.equal(validator.exiting, true);
        assert.equal(await predeploy.requestCount(), 1n);
        assert.equal(await predeploy.lastCaller(), megapoolAddress);
        assert.equal(await predeploy.lastValue(), fee);
        await assertFullExitRequests(predeploy, megapoolAddress, [await megapool.getValidatorPubkey(0n)], fee);
        assert.equal(await receiver.balance(), refund);
        assert.equal(await ethers.provider.getBalance(networkExitAddress), 0n);
        assert.equal(await ethers.provider.getBalance(megapoolAddress), megapoolBalanceBefore);
        assert.equal(await networkExit.getRequestedEth(), 28n * ETHER);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 0n), 1n);
        assert.notEqual(await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, 0n), 0n);

        await expectRevert(
            () => networkExit.connect(random).forceMegapoolExit(megapoolAddress, 0n, { value: fee }),
            "Already notified",
        );
        assert.equal(await networkExit.getRequestedEth(), 28n * ETHER);

        await current.time.advance(EXIT_WAIT * EPOCH_SECONDS);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        assert.equal(await networkExit.getRequestedEth(), 0n);
        assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 0n), 0n);
    });

    it("reverts the forced exit atomically when the predeploy or refund fails", async () => {
        const current = await load().ensure("current");
        const fee = 5n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 1);
        const networkExit = current.contracts.rocketNetworkExit;
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");
        await requestMegapoolExit(current, 0n);
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());

        await (await predeploy.setRevertRequest(true)).wait();
        await expectRevert(
            () => networkExit.connect(random).forceMegapoolExit(megapoolAddress, 0n, { value: fee }),
            "Failed to queue withdrawal",
        );
        assert.equal((await megapool.getValidatorInfo(0n)).exiting, false);
        assert.equal(await predeploy.requestCount(), 0n);

        await (await predeploy.setRevertRequest(false)).wait();
        const receiver = await current.context.fixtures.revertingReceiver.deploy("revertingExitFeeReceiver");
        const requestData = networkExit.interface.encodeFunctionData("forceMegapoolExit", [megapoolAddress, 0n]);
        const networkExitAddress = await networkExit.getAddress();
        await expectRevert(
            () => receiver.call(networkExitAddress, requestData, fee + 1n),
            "Failed to transfer",
        );
        assert.equal((await megapool.getValidatorInfo(0n)).exiting, false);
        assert.equal(await predeploy.requestCount(), 0n);
        assert.equal(await networkExit.getRequestedEth(), 28n * ETHER);
    });

    describe("owner-requested megapool exits", () => {
        const fee = 7n;

        before(async () => {
            const current = await load().ensure("current");
            await installWithdrawalRequestPredeploy(fee);
            await prepareStakingMegapool(current, 3);
        });

        for (const ownerActor of ["node", "nodeWithdrawal"]) {
            for (const debt of [0n, parseEther("0.2")]) {
                it(`lets ${ownerActor} exit all validators ${debt === 0n ? "without debt" : "beyond the deficit limit"}`, async () => {
                    const current = await load().ensure("current");
                    const owner = await current.context.actor(ownerActor);
                    const megapoolAddress = await current.megapools.address("node");
                    const megapool = await current.megapools.delegate("node");
                    const networkExit = current.contracts.rocketNetworkExit;
                    const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, owner);
                    if (debt > 0n) {
                        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
                        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
                    }
                    assert.equal(await megapool.getDebt(), debt);
                    const validatorIds = [0n, 1n, 2n];
                    // Neither an unrelated caller nor another registered node owns this megapool.
                    for (const otherActor of ["random", "node2"]) {
                        const other = await current.context.actor(otherActor);
                        await expectRevert(
                            () => networkExit.connect(other).exitMegapoolValidators(megapoolAddress, validatorIds, { value: fee * 3n }),
                            "Deficit too low",
                        );
                    }
                    for (const id of validatorIds) {
                        assert.equal(await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, id), 0n);
                    }
                    await (await networkExit.connect(owner).exitMegapoolValidators(megapoolAddress, validatorIds, { value: fee * 3n })).wait();
                    await assertFullExitRequests(predeploy, megapoolAddress, await Promise.all(validatorIds.map(id => megapool.getValidatorPubkey(id))), fee);
                    assert.equal(await predeploy.requestCount(), 3n);
                    assert.equal(await megapool.getExitingValidatorCount(), 3n);
                    for (const id of validatorIds) {
                        assert.equal((await megapool.getValidatorInfo(id)).exiting, true);
                    }
                });
            }
        }

        it("skips deficit accounting when the owner's bond is below the current requirement", async () => {
            const current = await load().ensure("current");
            await current.pdao.settings.nodes.setReducedBond(2n * ETHER);
            await current.megapools.reduceBond("node", 2n * ETHER);
            await current.pdao.settings.nodes.setReducedBond(4n * ETHER);
            const owner = await current.context.actor("node");
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");
            const effectiveBond = await megapool.getNodeBond() + await megapool.getNodeQueuedBond();
            const requirement = await current.contracts.rocketNodeDeposit.getBondRequirement(await megapool.getActiveValidatorCount());
            assert(effectiveBond < requirement, "The deficit calculation would underflow before the first exit");
            await (await current.contracts.rocketNetworkExit.connect(owner).exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
            assert.equal((await megapool.getValidatorInfo(0n)).exiting, true);
        });

        it("uses the current withdrawal address for owner authorisation", async () => {
            const current = await load().ensure("current");
            await current.nodes.setWithdrawalAddress("node", "node2", { confirm: true, caller: "nodeWithdrawal" });
            const oldWithdrawal = await current.context.actor("nodeWithdrawal");
            const newWithdrawal = await current.context.actor("node2");
            const networkExit = current.contracts.rocketNetworkExit;
            const megapoolAddress = await current.megapools.address("node");
            await expectRevert(
                () => networkExit.connect(oldWithdrawal).exitMegapoolValidators(megapoolAddress, [0n], { value: fee }),
                "Deficit too low",
            );
            await (await networkExit.connect(newWithdrawal).exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
            assert.equal((await (await current.megapools.delegate("node")).getValidatorInfo(0n)).exiting, true);
        });

        it("retains target, batch, validator, fee, and replay checks for owners", async () => {
            const current = await load().ensure("current");
            const owner = await current.context.actor("node");
            const networkExit = current.contracts.rocketNetworkExit.connect(owner);
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");
            const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, owner);
            await expectRevert(() => networkExit.exitMegapoolValidators(ethers.ZeroAddress, [0n], { value: fee }), "Invalid megapool");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, []), "No validators supplied");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 1n, 2n, 3n], { value: fee * 4n }), "Too many validators to exit");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 1n], { value: fee * 2n - 1n }), "Insufficient exit fee");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 0n], { value: fee * 2n }), "Already notified");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 99n], { value: fee * 2n }), "Validator is not staking");
            await current.megapools.deposit("node");
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 3n], { value: fee * 2n }), "Validator is not staking");
            assert.equal(await predeploy.requestCount(), 0n);
            assert.equal(await megapool.getExitingValidatorCount(), 0n);
            for (let id = 0n; id < 4n; id++) {
                assert.equal((await megapool.getValidatorInfo(id)).exiting, false);
            }
            await (await networkExit.exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n], { value: fee }), "Already notified");
            assert.equal(await predeploy.requestCount(), 1n);
        });

        it("rolls back failed owner exit submissions and refunds, then refunds excess on retry", async () => {
            const current = await load().ensure("current");
            const owner = await current.context.actor("node");
            const networkExit = current.contracts.rocketNetworkExit.connect(owner);
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");
            const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, owner);
            await (await predeploy.setRevertRequest(true)).wait();
            await expectRevert(() => networkExit.exitMegapoolValidators(megapoolAddress, [0n, 1n], { value: fee * 2n }), "Failed to queue withdrawal");
            await (await predeploy.setRevertRequest(false)).wait();
            const receiver = await current.context.fixtures.revertingReceiver.deploy("ownerExitFeeReceiver");
            await current.nodes.setWithdrawalAddress("node", receiver.address, { confirm: true, caller: "nodeWithdrawal" });
            const requestData = networkExit.interface.encodeFunctionData("exitMegapoolValidators", [megapoolAddress, [0n, 1n]]);
            const networkExitAddress = await networkExit.getAddress();
            await expectRevert(() => receiver.call(networkExitAddress, requestData, fee * 2n + 1n), "Failed to transfer");
            assert.equal(await predeploy.requestCount(), 0n);
            assert.equal(await megapool.getExitingValidatorCount(), 0n);
            assert.equal((await megapool.getValidatorInfo(0n)).exiting, false);
            assert.equal((await megapool.getValidatorInfo(1n)).exiting, false);
            await receiver.setEnabled(false);
            await receiver.call(networkExitAddress, requestData, fee * 2n + 1n);
            await assertFullExitRequests(predeploy, megapoolAddress, await Promise.all([0n, 1n].map(id => megapool.getValidatorPubkey(id))), fee);
            assert.equal(await receiver.balance(), 1n);
            assert.equal(await ethers.provider.getBalance(networkExitAddress), 0n);
            assert.equal(await predeploy.requestCount(), 2n);
            assert.equal(await megapool.getExitingValidatorCount(), 2n);
        });
    });

    const deficitCases = [
        { name: "allows a single exit at the threshold", validators: 1, debt: parseEther("0.2"), pending: 0, requested: 1, allowed: true },
        { name: "rejects a single exit one wei below the threshold", validators: 1, debt: parseEther("0.2") - 1n, pending: 0, requested: 1, allowed: false },
        { name: "allows the three exits needed to clear 9 ETH debt", validators: 4, debt: 9n * ETHER, pending: 0, requested: 3, allowed: true },
        { name: "rejects an unnecessary fourth exit atomically", validators: 4, debt: 9n * ETHER, pending: 0, requested: 4, allowed: false },
        { name: "allows a smaller one-validator batch", validators: 4, debt: 9n * ETHER, pending: 0, requested: 1, allowed: true },
        { name: "allows a smaller two-validator batch", validators: 4, debt: 9n * ETHER, pending: 0, requested: 2, allowed: true },
        { name: "allows the final necessary exit with two exits pending", validators: 4, debt: 9n * ETHER, pending: 2, requested: 1, allowed: true },
        { name: "rejects two more exits when two are already pending", validators: 4, debt: 9n * ETHER, pending: 2, requested: 2, allowed: false },
        { name: "allows an exit at the threshold after a pending exit", validators: 3, debt: parseEther("4.2"), pending: 1, requested: 1, allowed: true },
        { name: "rejects an exit one wei below the threshold after a pending exit", validators: 3, debt: parseEther("4.2") - 1n, pending: 1, requested: 1, allowed: false },
        { name: "allows a single exit at the threshold with queued validators", validators: 1, queued: 2, debt: parseEther("0.2"), pending: 0, requested: 1, allowed: true },
        { name: "rejects a single exit below the threshold with queued validators", validators: 1, queued: 2, debt: parseEther("0.2") - 1n, pending: 0, requested: 1, allowed: false },
        { name: "allows two necessary exits with queued validators", validators: 2, queued: 2, debt: parseEther("4.2"), pending: 0, requested: 2, allowed: true },
        { name: "rejects an unnecessary second exit with queued validators", validators: 2, queued: 2, debt: parseEther("4.2") - 1n, pending: 0, requested: 2, allowed: false },
    ];

    for (const scenario of deficitCases) {
        it(`RPIP-44 deficit boundary: ${scenario.name}`, async () => {
            const current = await load().ensure("current");
            const fee = 3n;
            const predeploy = await installWithdrawalRequestPredeploy(fee);
            await prepareStakingMegapool(current, scenario.validators);
            const queuedValidators = scenario.queued ?? 0;
            for (let index = 0; index < queuedValidators; index++) {
                // No additional user deposits: these validators remain in the queue.
                await current.megapools.deposit("node");
            }
            const random = await current.context.actor("random");
            const networkExit = current.contracts.rocketNetworkExit.connect(random);
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");

            // Isolate the exit-count boundary using 4 ETH bonds and no available funds
            assert.equal(await megapool.getNodeBond(), BigInt(scenario.validators) * 4n * ETHER);
            assert.equal(await megapool.getNodeQueuedBond(), BigInt(queuedValidators) * 4n * ETHER);
            assert.equal(await megapool.getActiveValidatorCount(), BigInt(scenario.validators + queuedValidators));
            assert.equal(await megapool.getPendingRewards(), 0n);
            assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(await megapool.getNodeAddress()), 0n);
            assert.equal(await current.contracts.rocketDAOProtocolSettingsMegapool.getExitDeficit(), parseEther("0.2"));
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, scenario.debt, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, scenario.debt, "trusted2");
            assert.equal(await megapool.getDebt(), scenario.debt);

            if (scenario.pending > 0) {
                const pendingIds = Array.from({ length: scenario.pending }, (_, index) => BigInt(index));
                await (await networkExit.exitMegapoolValidators(
                    megapoolAddress, pendingIds, { value: fee * BigInt(scenario.pending) },
                )).wait();
            }

            const validatorIds = Array.from({ length: scenario.requested }, (_, index) => BigInt(scenario.pending + index));
            const forceExit = () => networkExit.exitMegapoolValidators(
                megapoolAddress, validatorIds, { value: fee * BigInt(scenario.requested) },
            );
            if (scenario.allowed) {
                await (await forceExit()).wait();
                const pubkeys = await Promise.all(validatorIds.map(id => megapool.getValidatorPubkey(id)));
                await assertFullExitRequests(predeploy, megapoolAddress, pubkeys, fee);
            } else {
                await expectRevert(forceExit, "Deficit too low");
            }

            const expectedExiting = BigInt(scenario.pending + (scenario.allowed ? scenario.requested : 0));
            assert.equal(await predeploy.requestCount(), expectedExiting);
            assert.equal(await megapool.getExitingValidatorCount(), expectedExiting);
            for (let id = 0n; id < BigInt(scenario.validators); id++) {
                assert.equal((await megapool.getValidatorInfo(id)).exiting, id < expectedExiting);
            }
            for (let id = BigInt(scenario.validators); id < BigInt(scenario.validators + queuedValidators); id++) {
                const validator = await megapool.getValidatorInfo(id);
                assert.equal(validator.inQueue, true);
                assert.equal(validator.exiting, false);
            }
        });
    }

    describe("RPIP-44 refund accounting", () => {
        const fee = 3n;

        before(async () => {
            const current = await load().ensure("current");
            await installWithdrawalRequestPredeploy(fee);
            await prepareStakingMegapool(current, 3);
            const random = await current.context.actor("random");
            const megapoolAddress = await current.megapools.address("node");
            const megapool = RocketMegapoolDelegate__factory.connect(megapoolAddress, random);

            // Distribute before applying debt, leaving the node's share unclaimed.
            await (await random.sendTransaction({ to: megapoolAddress, value: 100n * ETHER })).wait();
            await (await megapool.distribute()).wait();
            assert((await megapool.getRefundValue()) > 1n);
            assert.equal(await megapool.getPendingRewards(), 0n);
            assert.equal(await megapool.getNodeBond(), 12n * ETHER);
            assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(await megapool.getNodeAddress()), 0n);
            assert.equal(await current.contracts.rocketDAOProtocolSettingsMegapool.getExitDeficit(), parseEther("0.2"));
        });

        const refundCases = [
            { name: "rejects an exit when refunds exactly cover debt", remainder: 0n, pending: 0, requested: 1, allowed: false },
            { name: "rejects an exit when refunds exceed debt", remainder: -1n, pending: 0, requested: 1, allowed: false },
            { name: "allows an exit at the threshold after accounting for refunds", remainder: parseEther("0.2"), pending: 0, requested: 1, allowed: true },
            { name: "rejects an exit one wei below the threshold after accounting for refunds", remainder: parseEther("0.2") - 1n, pending: 0, requested: 1, allowed: false },
            { name: "allows the two exits needed after accounting for refunds", remainder: parseEther("4.2"), pending: 0, requested: 2, allowed: true },
            { name: "rejects an unnecessary third exit after accounting for refunds", remainder: parseEther("4.2"), pending: 0, requested: 3, allowed: false },
            { name: "allows the final exit after accounting for refunds and a pending exit", remainder: parseEther("4.2"), pending: 1, requested: 1, allowed: true },
            { name: "rejects two more exits after accounting for refunds and a pending exit", remainder: parseEther("4.2"), pending: 1, requested: 2, allowed: false },
            { name: "counts refunds and pending rewards once at the threshold", remainder: parseEther("0.2"), pending: 0, requested: 1, allowed: true, pendingRewards: ETHER },
            { name: "rejects an exit one wei below the combined refund and pending reward threshold", remainder: parseEther("0.2") - 1n, pending: 0, requested: 1, allowed: false, pendingRewards: ETHER },
        ];

        for (const scenario of refundCases) {
            it(scenario.name, async () => {
                const current = await load().ensure("current");
                const random = await current.context.actor("random");
                const networkExit = current.contracts.rocketNetworkExit.connect(random);
                const megapoolAddress = await current.megapools.address("node");
                const megapool = await current.megapools.delegate("node");
                const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, random);
                const refund = await megapool.getRefundValue();
                const pendingRewards = scenario.pendingRewards ?? 0n;
                if (pendingRewards > 0n) {
                    await (await random.sendTransaction({ to: megapoolAddress, value: pendingRewards })).wait();
                }
                assert.equal(await megapool.getPendingRewards(), pendingRewards);
                const [nodeRewards] = await megapool.calculatePendingRewards();
                if (pendingRewards > 0n) {
                    assert(nodeRewards > 0n && nodeRewards < pendingRewards);
                }

                const debt = refund + nodeRewards + scenario.remainder;
                await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
                await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
                assert.equal(await megapool.getDebt(), debt);

                if (scenario.pending > 0) {
                    await (await networkExit.exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
                }
                const validatorStatesBefore = await Promise.all([0n, 1n, 2n].map(id => megapool.getValidatorInfo(id)));
                const validatorIds = Array.from({ length: scenario.requested }, (_, index) => BigInt(scenario.pending + index));
                const forceExit = () => networkExit.exitMegapoolValidators(
                    megapoolAddress, validatorIds, { value: fee * BigInt(scenario.requested) },
                );
                if (scenario.allowed) {
                    await (await forceExit()).wait();
                    const pubkeys = await Promise.all(validatorIds.map(id => megapool.getValidatorPubkey(id)));
                    await assertFullExitRequests(predeploy, megapoolAddress, pubkeys, fee);
                } else {
                    await expectRevert(forceExit, "Deficit too low");
                    const validatorStatesAfter = await Promise.all([0n, 1n, 2n].map(id => megapool.getValidatorInfo(id)));
                    assert.deepEqual(
                        validatorStatesAfter.map(state => Array.from(state)),
                        validatorStatesBefore.map(state => Array.from(state)),
                    );
                }

                const expectedExiting = BigInt(scenario.pending + (scenario.allowed ? scenario.requested : 0));
                assert.equal(await predeploy.requestCount(), expectedExiting);
                assert.equal(await megapool.getExitingValidatorCount(), expectedExiting);
                for (let id = 0n; id < 3n; id++) {
                    assert.equal((await megapool.getValidatorInfo(id)).exiting, id < expectedExiting);
                }
            });
        }
    });

    it("keeps the RPIP-44 deficit policy in NetworkExit and executes batches atomically", async () => {
        const current = await load().ensure("current");
        const fee = 3n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 3);
        const networkExit = current.contracts.rocketNetworkExit;
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");

        await expectRevert(
            () => networkExit.connect(random).exitMegapoolValidators(megapoolAddress, [0n], { value: fee }),
            "Deficit too low",
        );

        const penalty = 9n * ETHER;
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted2");

        await expectRevert(
            () => networkExit.connect(random).exitMegapoolValidators(megapoolAddress, [0n, 0n], { value: fee * 2n }),
            "Already notified",
        );
        assert.equal((await megapool.getValidatorInfo(0n)).exiting, false);
        assert.equal(await predeploy.requestCount(), 0n);

        await (await networkExit.connect(random).exitMegapoolValidators(
            megapoolAddress,
            [0n, 1n],
            { value: fee * 2n },
        )).wait();
        assert.equal((await megapool.getValidatorInfo(0n)).exiting, true);
        assert.equal((await megapool.getValidatorInfo(1n)).exiting, true);
        assert.equal(await predeploy.requestCount(), 2n);
        assert.equal(await predeploy.lastValue(), fee);
        await assertFullExitRequests(predeploy, megapoolAddress, [
            await megapool.getValidatorPubkey(0n),
            await megapool.getValidatorPubkey(1n),
        ], fee);
    });
});

describe("RocketNetworkExit bounded bond release", () => {
    const fee = 3n;
    type ProjectionCase = { name: string; debt: string; requested: number; pending?: number; allowed: boolean };
    type ProjectionFixture = {
        name: string;
        staked: number;
        queued?: number;
        reducedBond: bigint;
        reduceBy?: bigint;
        bond: bigint;
        requirement: bigint;
        requirementAfterOne: bigint;
        credit: bigint;
        cases: ProjectionCase[];
    };
    const fixtures: ProjectionFixture[] = [
        {
            name: "underbonded with three validators", staked: 3, reducedBond: 2n, reduceBy: 2n,
            bond: 10n, requirement: 12n, requirementAfterOne: 8n, credit: 2n,
            cases: [
                { name: "allows the first exit at the threshold without underflow", debt: "2.2", requested: 1, allowed: true },
                { name: "rejects the first exit one wei below the threshold without underflow", debt: "2.199999999999999999", requested: 1, allowed: false },
                { name: "allows two necessary exits", debt: "4.2", requested: 2, allowed: true },
                { name: "rejects an unnecessary third exit atomically", debt: "4.2", requested: 3, allowed: false },
                { name: "rejects two exits one wei below the threshold", debt: "4.199999999999999999", requested: 2, allowed: false },
                { name: "allows one additional exit after a pending exit", debt: "4.2", pending: 1, requested: 1, allowed: true },
                { name: "rejects two additional exits after a pending exit", debt: "4.2", pending: 1, requested: 2, allowed: false },
            ],
        },
        {
            name: "still underbonded after the first exit", staked: 4, reducedBond: 1n, reduceBy: 6n,
            bond: 10n, requirement: 16n, requirementAfterOne: 12n, credit: 6n,
            cases: [
                { name: "allows two exits with zero projected bond release", debt: "6.2", requested: 2, allowed: true },
                { name: "rejects an unnecessary third exit", debt: "6.2", requested: 3, allowed: false },
                { name: "rejects two exits one wei below the threshold without underflow", debt: "6.199999999999999999", requested: 2, allowed: false },
            ],
        },
        {
            name: "surplus bond before any exits", staked: 3, reducedBond: 2n,
            bond: 12n, requirement: 10n, requirementAfterOne: 8n, credit: 0n,
            cases: [
                { name: "allows the first exit without counting locked surplus", debt: "0.2", requested: 1, allowed: true },
                { name: "rejects the first exit one wei below the threshold", debt: "0.199999999999999999", requested: 1, allowed: false },
            ],
        },
        {
            name: "release capped by exiting principal", staked: 13, reducedBond: 1n,
            bond: 52n, requirement: 19n, requirementAfterOne: 18n, credit: 0n,
            cases: [
                { name: "caps the first exit's 34 ETH surplus at 32 ETH", debt: "32.2", requested: 2, allowed: true },
                { name: "rejects two exits one wei below the principal cap boundary", debt: "32.199999999999999999", requested: 2, allowed: false },
            ],
        },
        {
            name: "release capped by node bond with queued validators", staked: 2, queued: 3, reducedBond: 1n,
            bond: 8n, requirement: 11n, requirementAfterOne: 10n, credit: 0n,
            cases: [
                { name: "caps the 10 ETH surplus at the 8 ETH node bond", debt: "8.2", requested: 2, allowed: true },
                { name: "rejects both exits one wei below the node bond cap boundary", debt: "8.199999999999999999", requested: 2, allowed: false },
            ],
        },
    ];

    before(async () => {
        await prepareMegapoolProtocol();
    });

    async function accounting(current: ProtocolCurrent, ids: bigint[]) {
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const nodeAddress = await megapool.getNodeAddress();
        const networkExit = current.contracts.rocketNetworkExit;
        return {
            debt: await megapool.getDebt(),
            bond: await megapool.getNodeBond(),
            queuedBond: await megapool.getNodeQueuedBond(),
            userCapital: await megapool.getUserCapital(),
            userQueuedCapital: await megapool.getUserQueuedCapital(),
            credit: await current.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress),
            received: await current.contracts.rocketNodeDeposit.getNodeEthBalance(nodeAddress),
            refund: await megapool.getRefundValue(),
            rewards: await megapool.getPendingRewards(),
            active: await megapool.getActiveValidatorCount(),
            locked: await megapool.getLockedValidatorCount(),
            requestedEth: await networkExit.getRequestedEth(),
            voluntaryEth: await networkExit.getVoluntaryEth(),
            outstanding: await networkExit.getMegapoolOutstandingExitCount(megapoolAddress),
            exits: await Promise.all(ids.map(async id => [
                await networkExit.getMegapoolExitType(megapoolAddress, id),
                await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, id),
                await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, id),
            ])),
            megapoolBalance: await ethers.provider.getBalance(megapoolAddress),
            networkExitBalance: await ethers.provider.getBalance(await networkExit.getAddress()),
            depositPoolBalance: await current.contracts.rocketDepositPool.getBalance(),
            nodeVaultBalance: await current.contracts.rocketVault.balanceOf("rocketNodeDeposit"),
        };
    }

    for (const fixture of fixtures) {
        describe(fixture.name, () => {
            before(async () => {
                const current = await load().ensure("current");
                await installWithdrawalRequestPredeploy(fee);
                await prepareStakingMegapool(current, fixture.staked);
                if (fixture.queued) {
                    await current.pdao.settings.deposits.setAssignmentsEnabled(false);
                    for (let index = 0; index < fixture.queued; index++) await current.megapools.deposit("node");
                }
                await current.pdao.settings.nodes.setReducedBond(fixture.reducedBond * ETHER);
                if (fixture.reduceBy) {
                    await current.megapools.reduceBond("node", fixture.reduceBy * ETHER);
                    await current.pdao.settings.nodes.setReducedBond(4n * ETHER);
                }
                const megapool = await current.megapools.delegate("node");
                const nodeAddress = await megapool.getNodeAddress();
                const activeCount = BigInt(fixture.staked + (fixture.queued ?? 0));
                assert.equal(await megapool.getActiveValidatorCount(), activeCount);
                assert.equal(await megapool.getNodeBond(), fixture.bond * ETHER);
                assert.equal(await megapool.getNodeQueuedBond(), BigInt(fixture.queued ?? 0) * 4n * ETHER);
                assert.equal(await current.contracts.rocketNodeDeposit.getBondRequirement(activeCount), fixture.requirement * ETHER);
                assert.equal(await current.contracts.rocketNodeDeposit.getBondRequirement(activeCount - 1n), fixture.requirementAfterOne * ETHER);
                // Reductions create real credit, which must remain included in the deficit calculation.
                assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress), fixture.credit * ETHER);
                assert.equal(await current.contracts.rocketNodeDeposit.getNodeEthBalance(nodeAddress), 0n);
                assert.equal(await megapool.getRefundValue(), 0n);
                assert.equal(await megapool.getPendingRewards(), 0n);
                assert.equal(await current.contracts.rocketDAOProtocolSettingsMegapool.getExitDeficit(), parseEther("0.2"));
            });

            for (const scenario of fixture.cases) {
                it(scenario.name, async () => {
                    const current = await load().ensure("current");
                    const megapoolAddress = await current.megapools.address("node");
                    const megapool = await current.megapools.delegate("node");
                    const random = await current.context.actor("random");
                    const networkExit = current.contracts.rocketNetworkExit.connect(random);
                    const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, random);
                    const debt = parseEther(scenario.debt);
                    await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
                    await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
                    assert.equal(await megapool.getDebt(), debt);
                    const pending = scenario.pending ?? 0;
                    if (pending > 0) {
                        await (await networkExit.exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
                    }
                    const allIds = Array.from({ length: fixture.staked + (fixture.queued ?? 0) }, (_, id) => BigInt(id));
                    const ids = Array.from({ length: scenario.requested }, (_, id) => BigInt(pending + id));
                    const before = await accounting(current, allIds);
                    const validatorsBefore = await Promise.all(allIds.map(async id => Array.from(await megapool.getValidatorInfo(id))));
                    const predeployBalanceBefore = await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY);
                    const requestBefore = await predeploy.lastRequest();
                    assert.equal(await predeploy.requestCount(), BigInt(pending));
                    const request = () => networkExit.exitMegapoolValidators(megapoolAddress, ids, { value: fee * BigInt(ids.length) });
                    if (scenario.allowed) {
                        await (await request()).wait();
                        await assertFullExitRequests(predeploy, megapoolAddress, await Promise.all(ids.map(id => megapool.getValidatorPubkey(id))), fee);
                    } else {
                        await expectRevert(request, "Deficit too low");
                        assert.deepEqual(await Promise.all(allIds.map(async id => Array.from(await megapool.getValidatorInfo(id)))), validatorsBefore);
                        assert.equal(await predeploy.lastRequest(), requestBefore);
                    }
                    assert.deepEqual(await accounting(current, allIds), before);
                    const added = scenario.allowed ? BigInt(ids.length) : 0n;
                    const totalExiting = BigInt(pending) + added;
                    assert.equal(await megapool.getExitingValidatorCount(), totalExiting);
                    assert.equal(await predeploy.requestCount(), totalExiting);
                    assert.equal(await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY), predeployBalanceBefore + fee * added);
                    for (let id = 0n; id < BigInt(fixture.staked); id++) {
                        assert.equal((await megapool.getValidatorInfo(id)).exiting, id < totalExiting);
                    }
                    for (let id = fixture.staked; id < allIds.length; id++) {
                        assert.deepEqual(Array.from(await megapool.getValidatorInfo(BigInt(id))), validatorsBefore[id]);
                        assert.equal((await megapool.getValidatorInfo(BigInt(id))).inQueue, true);
                    }
                });
            }
        });
    }
});

describe("RocketNetworkExit deposited node ETH accounting", () => {
    const fee = 3n;
    const received = ETHER;

    before(async () => {
        const current = await prepareMegapoolProtocol();
        await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 3);
        const nodeAddress = await current.context.actorAddress("node");
        const random = await current.context.actor("random");
        await (await current.contracts.rocketNodeDeposit.connect(random).depositEthFor(nodeAddress, { value: received })).wait();
        assert.equal(await current.contracts.rocketNodeDeposit.getNodeEthBalance(nodeAddress), received);
        assert.equal(await current.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress), 0n);
        const megapool = await current.megapools.delegate("node");
        assert.equal(await megapool.getNodeBond(), 12n * ETHER);
        assert.equal(await megapool.getNodeQueuedBond(), 0n);
        assert.equal(await megapool.getRefundValue(), 0n);
        assert.equal(await megapool.getPendingRewards(), 0n);
    });

    async function funds(current: ProtocolCurrent) {
        const nodeAddress = await current.context.actorAddress("node");
        const megapool = await current.megapools.delegate("node");
        return {
            received: await current.contracts.rocketNodeDeposit.getNodeEthBalance(nodeAddress),
            credit: await current.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress),
            refund: await megapool.getRefundValue(),
            rewards: await megapool.getPendingRewards(),
            debt: await megapool.getDebt(),
            bond: await megapool.getNodeBond(),
            queuedBond: await megapool.getNodeQueuedBond(),
            userCapital: await megapool.getUserCapital(),
            nodeVaultBalance: await current.contracts.rocketVault.balanceOf("rocketNodeDeposit"),
            megapoolBalance: await ethers.provider.getBalance(await current.megapools.address("node")),
            networkExitBalance: await ethers.provider.getBalance(await current.contracts.rocketNetworkExit.getAddress()),
        };
    }

    async function assertExit(current: ProtocolCurrent, ids: bigint[], allowed: boolean) {
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");
        const networkExit = current.contracts.rocketNetworkExit.connect(random);
        const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, random);
        const fundsBefore = await funds(current);
        const validatorsBefore = await Promise.all([0n, 1n, 2n].map(async id => Array.from(await megapool.getValidatorInfo(id))));
        const exitingBefore = await megapool.getExitingValidatorCount();
        const activeBefore = await megapool.getActiveValidatorCount();
        const lockedBefore = await megapool.getLockedValidatorCount();
        const requestsBefore = await predeploy.requestCount();
        const predeployBalanceBefore = await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY);
        const request = () => networkExit.exitMegapoolValidators(megapoolAddress, ids, { value: fee * BigInt(ids.length) });
        if (allowed) {
            await (await request()).wait();
            await assertFullExitRequests(predeploy, megapoolAddress, await Promise.all(ids.map(id => megapool.getValidatorPubkey(id))), fee);
            for (const id of ids) assert.equal((await megapool.getValidatorInfo(id)).exiting, true);
        } else {
            await expectRevert(request, "Deficit too low");
            assert.deepEqual(await Promise.all([0n, 1n, 2n].map(async id => Array.from(await megapool.getValidatorInfo(id)))), validatorsBefore);
        }
        // Eligibility checks count available funds without consuming balances or repaying debt.
        assert.deepEqual(await funds(current), fundsBefore);
        const additionalExits = allowed ? BigInt(ids.length) : 0n;
        assert.equal(await megapool.getExitingValidatorCount(), exitingBefore + additionalExits);
        assert.equal(await megapool.getActiveValidatorCount(), activeBefore);
        assert.equal(await megapool.getLockedValidatorCount(), lockedBefore);
        assert.equal(await predeploy.requestCount(), requestsBefore + additionalExits);
        assert.equal(await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY), predeployBalanceBefore + fee * additionalExits);
    }

    const cases = [
        { name: "rejects an exit when deposited ETH covers debt", debt: received, pending: false, ids: [0n], allowed: false },
        { name: "rejects an exit when deposited ETH exceeds debt", debt: received - 1n, pending: false, ids: [0n], allowed: false },
        { name: "allows an exit exactly at the threshold after deposited ETH", debt: received + parseEther("0.2"), pending: false, ids: [0n], allowed: true },
        { name: "rejects an exit one wei below the threshold after deposited ETH", debt: received + parseEther("0.2") - 1n, pending: false, ids: [0n], allowed: false },
        { name: "allows two necessary exits after deposited ETH", debt: received + parseEther("4.2"), pending: false, ids: [0n, 1n], allowed: true },
        { name: "rejects an unnecessary third exit after deposited ETH", debt: received + parseEther("4.2"), pending: false, ids: [0n, 1n, 2n], allowed: false },
        { name: "allows one additional exit after deposited ETH and a pending exit", debt: received + parseEther("4.2"), pending: true, ids: [1n], allowed: true },
        { name: "rejects two additional exits after deposited ETH and a pending exit", debt: received + parseEther("4.2"), pending: true, ids: [1n, 2n], allowed: false },
    ];
    for (const scenario of cases) {
        it(scenario.name, async () => {
            const current = await load().ensure("current");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, scenario.debt, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, scenario.debt, "trusted2");
            if (scenario.pending) await assertExit(current, [0n], true);
            await assertExit(current, scenario.ids, scenario.allowed);
        });
    }

    for (const belowThreshold of [false, true]) {
        it(`counts deposited ETH, credit, refunds and pending node rewards once ${belowThreshold ? "below" : "at"} the threshold`, async () => {
            const current = await load().ensure("current");
            const nodeAddress = await current.context.actorAddress("node");
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");
            const random = await current.context.actor("random");
            // Dequeuing a validator creates real credit without changing the three staked validators' bond.
            await current.megapools.deposit("node");
            assert.equal((await megapool.getValidatorInfo(3n)).inQueue, true);
            await current.megapools.dequeue("node", 3n);
            const credit = await current.contracts.rocketDepositPool.getNodeCreditBalance(nodeAddress);
            assert.equal(credit, 4n * ETHER);
            assert.equal(await megapool.getNodeBond(), 12n * ETHER);

            await (await random.sendTransaction({ to: megapoolAddress, value: 100n * ETHER })).wait();
            await current.megapools.distribute("node", "random");
            const refund = await megapool.getRefundValue();
            assert(refund > 0n);
            await (await random.sendTransaction({ to: megapoolAddress, value: ETHER })).wait();
            const [nodeRewards] = await megapool.calculatePendingRewards();
            assert(nodeRewards > 0n && nodeRewards < ETHER);
            const debt = received + credit + refund + nodeRewards + parseEther("0.2") - (belowThreshold ? 1n : 0n);
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
            await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
            await assertExit(current, [0n], !belowThreshold);
        });
    }

    it("uses the current deposited balance after a withdrawal", async () => {
        const current = await load().ensure("current");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, received, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, received, "trusted2");
        await assertExit(current, [0n], false);

        const nodeAddress = await current.context.actorAddress("node");
        const withdrawalAddress = await current.context.actor("nodeWithdrawal");
        await (await current.contracts.rocketNodeDeposit.connect(withdrawalAddress).withdrawEth(nodeAddress, received)).wait();
        assert.equal(await current.contracts.rocketNodeDeposit.getNodeEthBalance(nodeAddress), 0n);
        await assertExit(current, [0n], true);
    });
});

describe("RocketNetworkExit dissolved validators", () => {
    const fee = 7n;
    const dissolvedId = 2n;

    before(async () => {
        const current = await prepareMegapoolProtocol();
        await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 2);
        await current.depositPool.fund("depositor", 28n * ETHER);
        await current.megapools.deposit("node");
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsMegapool.getTimeBeforeDissolve() + 1n);
        await dissolveMegapoolValidatorAndAssert(current, "node", dissolvedId, { caller: "random" });
        assert.equal(await (await current.megapools.delegate("node")).getActiveValidatorCount(), 2n);
    });

    async function state(current: ProtocolCurrent) {
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const networkExit = current.contracts.rocketNetworkExit;
        const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, ethers.provider);
        return {
            validators: await Promise.all([0n, 1n, dissolvedId].map(async id => Array.from(await megapool.getValidatorInfo(id)))),
            active: await megapool.getActiveValidatorCount(),
            exiting: await megapool.getExitingValidatorCount(),
            locked: await megapool.getLockedValidatorCount(),
            debt: await megapool.getDebt(),
            bond: await megapool.getNodeBond(),
            userCapital: await megapool.getUserCapital(),
            refund: await megapool.getRefundValue(),
            requestedEth: await networkExit.getRequestedEth(),
            voluntaryEth: await networkExit.getVoluntaryEth(),
            outstanding: await networkExit.getMegapoolOutstandingExitCount(megapoolAddress),
            exitType: await networkExit.getMegapoolExitType(megapoolAddress, dissolvedId),
            expectedCapital: await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, dissolvedId),
            cooperativeStart: await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, dissolvedId),
            requests: await predeploy.requestCount(),
            megapoolBalance: await ethers.provider.getBalance(megapoolAddress),
            networkExitBalance: await ethers.provider.getBalance(await networkExit.getAddress()),
            predeployBalance: await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY),
        };
    }

    it("rejects dissolved validators in owner and deficit exits, rolling back mixed batches", async () => {
        const current = await load().ensure("current");
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const networkExit = current.contracts.rocketNetworkExit;
        // Cover the refunded bond and the release from the first exit so deficit checks permit both batch sizes.
        const debt = 9n * ETHER;
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
        const before = await state(current);
        for (const actor of ["node", "nodeWithdrawal", "random"]) {
            const caller = await current.context.actor(actor);
            for (const ids of [[dissolvedId], [0n, dissolvedId]]) {
                await expectRevert(
                    () => networkExit.connect(caller).exitMegapoolValidators(megapoolAddress, ids, { value: fee * BigInt(ids.length) }),
                    "Validator is dissolved",
                );
                assert.deepEqual(await state(current), before);
            }
        }
        // The dissolved validator has not consumed either remaining validator's exit allowance.
        const node = await current.context.actor("node");
        await (await networkExit.connect(node).exitMegapoolValidators(megapoolAddress, [0n, 1n], { value: fee * 2n })).wait();
        assert.equal(await megapool.getExitingValidatorCount(), 2n);
        assert.equal((await megapool.getValidatorInfo(dissolvedId)).exiting, false);
        const predeploy = WithdrawalRequestPredeployMock__factory.connect(WITHDRAWAL_REQUEST_PREDEPLOY, node);
        assert.equal(await predeploy.requestCount(), 2n);
        await assertFullExitRequests(predeploy, megapoolAddress, [
            await megapool.getValidatorPubkey(0n),
            await megapool.getValidatorPubkey(1n),
        ], fee);
    });

    it("rejects dissolved exit notifications without blocking rewards or other validator notifications", async () => {
        const current = await load().ensure("current");
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");
        const before = await state(current);
        const withdrawableEpoch = await currentEpoch(current) + EXIT_WAIT;
        // Supply a proof-shaped notification through the manager, reaching the delegate's shared guard.
        await expectRevert(
            () => notifyMegapoolExitAndAssert(current, "node", dissolvedId, withdrawableEpoch),
            "Validator is dissolved",
        );
        await expectRevert(() => requestMegapoolExit(current, dissolvedId), "Validator is not staking");
        await expectRevert(
            () => current.contracts.rocketNetworkExit.connect(random).retryMegapoolExit(megapoolAddress, dissolvedId, { value: fee }),
            "Validator is not exiting",
        );
        assert.deepEqual(await state(current), before);

        await (await random.sendTransaction({ to: megapoolAddress, value: ETHER })).wait();
        await distributeMegapoolRewardsAndAssert(current, "node", "random");
        assert.equal(await megapool.getExitingValidatorCount(), 0n);
        assert.equal(await megapool.getLockedValidatorCount(), 0n);

        await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current) + EXIT_WAIT);
        assert.equal(await megapool.getExitingValidatorCount(), 1n);
        await current.time.advance(EXIT_WAIT * EPOCH_SECONDS);
        await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
        assert.equal(await megapool.getExitingValidatorCount(), 0n);
        assert.equal(await megapool.getActiveValidatorCount(), 1n);
        assert.equal((await megapool.getValidatorInfo(dissolvedId)).exiting, false);
    });
});

describe("RocketNetworkExit megapool exit retries", () => {
    const fee = 7n;

    before(async () => {
        await prepareMegapoolProtocol();
    });

    async function exitState(current: ProtocolCurrent) {
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const networkExit = current.contracts.rocketNetworkExit;
        return {
            validator: Array.from(await megapool.getValidatorInfo(0n)),
            active: await megapool.getActiveValidatorCount(),
            exiting: await megapool.getExitingValidatorCount(),
            locked: await megapool.getLockedValidatorCount(),
            debt: await megapool.getDebt(),
            refund: await megapool.getRefundValue(),
            bond: await megapool.getNodeBond(),
            userCapital: await megapool.getUserCapital(),
            requestedEth: await networkExit.getRequestedEth(),
            voluntaryEth: await networkExit.getVoluntaryEth(),
            exitType: await networkExit.getMegapoolExitType(megapoolAddress, 0n),
            expectedCapital: await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, 0n),
            outstanding: await networkExit.getMegapoolOutstandingExitCount(megapoolAddress),
            cooperativeStart: await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, 0n),
            megapoolBalance: await ethers.provider.getBalance(megapoolAddress),
            networkExitBalance: await ethers.provider.getBalance(await networkExit.getAddress()),
        };
    }

    async function requestState(predeploy: WithdrawalRequestPredeployMock) {
        return {
            count: await predeploy.requestCount(),
            caller: await predeploy.lastCaller(),
            value: await predeploy.lastValue(),
            data: await predeploy.lastRequest(),
            balance: await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY),
        };
    }

    for (const initialExit of ["owner", "deficit", "cooperative", "voluntary"] as const) {
        it(`permissionlessly retries a ${initialExit} exit repeatedly without changing its state or accounting`, async () => {
            const current = await load().ensure("current");
            const predeploy = await installWithdrawalRequestPredeploy(fee);
            await prepareStakingMegapool(current, 1);
            const megapoolAddress = await current.megapools.address("node");
            const megapool = await current.megapools.delegate("node");
            const random = await current.context.actor("random");
            const node = await current.context.actor("node");
            const networkExit = current.contracts.rocketNetworkExit.connect(random);
            if (initialExit === "owner") {
                assert.equal(await megapool.getDebt(), 0n);
                await (await networkExit.connect(node).exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
            } else if (initialExit === "deficit") {
                const debt = parseEther("0.2");
                await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted1");
                await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, debt, "trusted2");
                await (await networkExit.exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
            } else if (initialExit === "cooperative") {
                await requestMegapoolExit(current, 0n);
                await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());
                await (await networkExit.forceMegapoolExit(megapoolAddress, 0n, { value: fee })).wait();
            } else {
                await notifyMegapoolExitAndAssert(current, "node", 0n, await currentEpoch(current) + EXIT_WAIT);
            }
            const beforeRetry = await exitState(current);
            const requestsBefore = await predeploy.requestCount();
            const delegate = RocketMegapoolDelegate__factory.connect(megapoolAddress, random);
            const pubkey = await megapool.getValidatorPubkey(0n);
            // No cooldown or new exit allowance is needed, even with all active validators already exiting.
            for (let retry = 0; retry < 2; retry++) {
                const currentFee = fee + BigInt(retry);
                await (await predeploy.setFee(currentFee)).wait();
                await (await networkExit.retryMegapoolExit(megapoolAddress, 0n, { value: currentFee })).wait();
                assert.deepEqual(await exitState(current), beforeRetry);
                assert.equal(await predeploy.requestCount(), requestsBefore + BigInt(retry) + 1n);
                await assertFullExitRequests(predeploy, megapoolAddress, [pubkey], currentFee);
                const events = await delegate.queryFilter(delegate.filters.MegapoolValidatorExitRetried(), "latest", "latest");
                assert.equal(events.length, 1);
                assert.equal(events[0].args.validatorId, 0n);
                assert.equal(events[0].args.time, await current.time.latest());
                assert.equal((await delegate.queryFilter(delegate.filters.MegapoolValidatorForceExited(), "latest", "latest")).length, 0);
                assert.equal((await delegate.queryFilter(delegate.filters.MegapoolValidatorExiting(), "latest", "latest")).length, 0);
            }
            await expectRevert(() => current.megapools.distribute("node"), "Pending validator exit");

            await current.time.advance(EXIT_WAIT * EPOCH_SECONDS);
            await finaliseMegapoolValidatorAndAssert(current, "node", 0n, 32n * ETHER);
            assert.equal(await megapool.getExitingValidatorCount(), 0n);
            assert.equal(await networkExit.getRequestedEth(), 0n);
            assert.equal(await networkExit.getVoluntaryEth(), 0n);
            assert.equal(await networkExit.getMegapoolOutstandingExitCount(megapoolAddress), 0n);
            assert.equal(await networkExit.getMegapoolExitType(megapoolAddress, 0n), 0n);
            assert.equal(await networkExit.getMegapoolExpectedUserCapital(megapoolAddress, 0n), 0n);
            assert.equal(await networkExit.getMegapoolCooperativeExitStart(megapoolAddress, 0n), 0n);
            const finalState = await exitState(current);
            const finalRequests = await requestState(predeploy);
            await expectRevert(
                () => networkExit.retryMegapoolExit(megapoolAddress, 0n, { value: fee + 1n }),
                "Already exited",
            );
            assert.deepEqual(await exitState(current), finalState);
            assert.deepEqual(await requestState(predeploy), finalRequests);
            await current.megapools.distribute("node");
        });
    }

    it("rejects invalid retry targets, merely requested exits, and direct delegate calls", async () => {
        const current = await load().ensure("current");
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 1);
        const megapoolAddress = await current.megapools.address("node");
        const random = await current.context.actor("random");
        const networkExit = current.contracts.rocketNetworkExit.connect(random);
        const beforeRequest = await exitState(current);
        const beforeRequests = await requestState(predeploy);
        await expectRevert(
            () => networkExit.retryMegapoolExit(ethers.ZeroAddress, 0n, { value: fee }),
            "Invalid megapool",
        );
        await expectRevert(
            () => networkExit.retryMegapoolExit(megapoolAddress, 1n, { value: fee }),
            "Validator does not exist",
        );
        await expectRevert(
            () => networkExit.retryMegapoolExit(megapoolAddress, 0n, { value: fee }),
            "Validator is not exiting",
        );
        assert.deepEqual(await exitState(current), beforeRequest);
        assert.deepEqual(await requestState(predeploy), beforeRequests);

        await requestMegapoolExit(current, 0n);
        const requestedState = await exitState(current);
        await expectRevert(
            () => networkExit.retryMegapoolExit(megapoolAddress, 0n, { value: fee }),
            "Validator is not exiting",
        );
        assert.deepEqual(await exitState(current), requestedState);
        assert.deepEqual(await requestState(predeploy), beforeRequests);

        const node = await current.context.actor("node");
        await (await networkExit.connect(node).exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
        const exitingState = await exitState(current);
        const exitingRequests = await requestState(predeploy);
        for (const caller of [random, node]) {
            const delegate = RocketMegapoolDelegate__factory.connect(megapoolAddress, caller);
            await expectRevert(() => delegate.retryExit(0n, { value: fee }), "Invalid or outdated contract");
        }
        assert.deepEqual(await exitState(current), exitingState);
        assert.deepEqual(await requestState(predeploy), exitingRequests);
    });

    it("refunds excess retry fees and rolls back failed payments, submissions, and refunds", async () => {
        const current = await load().ensure("current");
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        await prepareStakingMegapool(current, 1);
        const megapoolAddress = await current.megapools.address("node");
        const megapool = await current.megapools.delegate("node");
        const random = await current.context.actor("random");
        const node = await current.context.actor("node");
        const networkExit = current.contracts.rocketNetworkExit.connect(random);
        await (await networkExit.connect(node).exitMegapoolValidators(megapoolAddress, [0n], { value: fee })).wait();
        const beforeRetry = await exitState(current);
        const beforeRequests = await requestState(predeploy);
        const receiver = await current.context.fixtures.revertingReceiver.deploy("retryFeeReceiver");
        const networkExitAddress = await networkExit.getAddress();
        const retryData = networkExit.interface.encodeFunctionData("retryMegapoolExit", [megapoolAddress, 0n]);
        const refund = 11n;
        for (const failure of ["fee", "predeploy", "refund"] as const) {
            await (await predeploy.setRevertRequest(failure === "predeploy")).wait();
            if (failure === "refund") {
                await expectRevert(() => receiver.call(networkExitAddress, retryData, fee + refund), "Failed to transfer");
                assert.equal(await receiver.balance(), 0n);
            } else {
                await expectRevert(
                    () => networkExit.retryMegapoolExit(megapoolAddress, 0n, { value: failure === "fee" ? fee - 1n : fee }),
                    failure === "fee" ? "Insufficient exit fee" : "Failed to queue withdrawal",
                );
            }
            assert.deepEqual(await exitState(current), beforeRetry);
            assert.deepEqual(await requestState(predeploy), beforeRequests);
        }
        await receiver.setEnabled(false);
        // A refund callback cannot reuse the outer call's fee for another request.
        await receiver.setCallback(networkExitAddress, retryData);
        await receiver.call(networkExitAddress, retryData, fee + refund);
        assert.equal(await receiver.balance(), refund);
        assert.equal(await receiver.callbackCount(), 1n);
        assert.equal(await receiver.callbackSucceeded(), false);
        assert.deepEqual(await exitState(current), beforeRetry);
        assert.equal(await predeploy.requestCount(), beforeRequests.count + 1n);
        assert.equal(await ethers.provider.getBalance(WITHDRAWAL_REQUEST_PREDEPLOY), beforeRequests.balance + fee);
        await assertFullExitRequests(predeploy, megapoolAddress, [await megapool.getValidatorPubkey(0n)], fee);
    });
});

describe("RocketNetworkExit minipool triggered exits", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawal", { confirm: true });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: parseEther("16") });
        await rp131.depositPool.fund("depositor", parseEther("16"));
        await rp131.minipools.create("pool", { node: "node", bond: parseEther("16") });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
        const current = await rp131.upgradeTo("current");
        await current.minipools.delegateUpgrade("pool");
    });

    it("forces a requested exit with the exact fee, refunds excess, and rejects reentry", async () => {
        const current = await load().ensure("current");
        const fee = 7n;
        const refund = 11n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const networkExitAddress = await networkExit.getAddress();
        const minipool = current.minipools.get("pool");
        const random = await current.context.actor("random");
        const delegate = RocketMinipoolDelegate__factory.connect(minipool.address, random);
        const receiver = await current.context.fixtures.revertingReceiver.deploy("minipoolExitFeeReceiver");
        await receiver.setEnabled(false);

        assert.equal((await current.minipools.delegate("pool")).version, 4);
        await expectRevert(
            () => delegate.forceExit({ value: fee }),
            "Invalid or outdated contract",
        );

        await requestMinipoolExit(current, minipool.address);
        const requestTime = await networkExit.getMinipoolCooperativeExitStart(minipool.address);
        const requestedEth = await networkExit.getRequestedEth();

        await expectRevert(
            () => networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee }),
            "Not enough time has passed",
        );
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());
        await expectRevert(
            () => networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee - 1n }),
            "Insufficient exit fee",
        );

        const minipoolBalanceBefore = await ethers.provider.getBalance(minipool.address);
        const requestData = networkExit.interface.encodeFunctionData("forceMinipoolExit", [minipool.address]);
        await receiver.setCallback(networkExitAddress, requestData);
        await receiver.call(networkExitAddress, requestData, fee + refund);

        assert.equal(await predeploy.requestCount(), 1n);
        assert.equal(await predeploy.lastCaller(), minipool.address);
        assert.equal(await predeploy.lastValue(), fee);
        await assertFullExitRequests(predeploy, minipool.address, [minipool.pubkey], fee);
        assert.equal(await receiver.callbackCount(), 1n);
        assert.equal(await receiver.callbackSucceeded(), false);
        assert.equal(await receiver.balance(), refund);
        assert.equal(await ethers.provider.getBalance(networkExitAddress), 0n);
        assert.equal(await ethers.provider.getBalance(minipool.address), minipoolBalanceBefore);
        assert.equal(await networkExit.getMinipoolCooperativeExitStart(minipool.address), requestTime);
        assert.equal(await networkExit.getRequestedEth(), requestedEth);
        assert.equal(await networkExit.getMinipoolExpectedUserCapital(minipool.address), 16n * ETHER);
        await expectRevert(
            () => networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee }),
            "Force exit already submitted",
        );
    });

    it("rolls back failed predeploy submissions and allows retry", async () => {
        const current = await load().ensure("current");
        const fee = 5n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool");
        const random = await current.context.actor("random");
        await requestMinipoolExit(current, minipool.address);
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());

        await (await predeploy.setRevertRequest(true)).wait();
        await expectRevert(
            () => networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee }),
            "Failed to queue withdrawal",
        );
        assert.equal(await predeploy.requestCount(), 0n);

        await (await predeploy.setRevertRequest(false)).wait();
        await (await networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee })).wait();
        assert.equal(await predeploy.requestCount(), 1n);
    });

    it("rolls back failed refunds and allows retry", async () => {
        const current = await load().ensure("current");
        const fee = 5n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool");
        const random = await current.context.actor("random");
        const receiver = await current.context.fixtures.revertingReceiver.deploy("revertingMinipoolExitFeeReceiver");
        await requestMinipoolExit(current, minipool.address);
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());

        const requestData = networkExit.interface.encodeFunctionData("forceMinipoolExit", [minipool.address]);
        const networkExitAddress = await networkExit.getAddress();
        await expectRevert(
            () => receiver.call(networkExitAddress, requestData, fee + 1n),
            "Failed to transfer",
        );
        assert.equal(await predeploy.requestCount(), 0n);

        await (await networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee })).wait();
        assert.equal(await predeploy.requestCount(), 1n);
    });

    it("uses the same funded path through penaliseMinipool", async () => {
        const current = await load().ensure("current");
        const fee = 3n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool");
        const random = await current.context.actor("random");
        await requestMinipoolExit(current, minipool.address);
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());

        await (await networkExit.connect(random).penaliseMinipool(
            minipool.address,
            await current.time.latest(),
            {
                validatorIndex: 0n,
                validator: {
                    pubkey: "0x",
                    withdrawalCredentials: ethers.ZeroHash,
                    effectiveBalance: 0n,
                    slashed: false,
                    activationEligibilityEpoch: 0n,
                    activationEpoch: 0n,
                    exitEpoch: 0n,
                    withdrawableEpoch: 0n,
                },
                witnesses: [],
            },
            slotProof(0n),
            { value: fee },
        )).wait();

        assert.equal(await predeploy.requestCount(), 1n);
        assert.equal(await predeploy.lastCaller(), minipool.address);
        await assertFullExitRequests(predeploy, minipool.address, [minipool.pubkey], fee);
    });

    it("rejects force exit after the minipool has distributed", async () => {
        const current = await load().ensure("current");
        const fee = 3n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool");
        const random = await current.context.actor("random");
        await requestMinipoolExit(current, minipool.address);
        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: 32n * ETHER,
            expectedUser: 16n * ETHER,
            expectedNode: 16n * ETHER,
        });
        await current.time.advance(await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase());

        await expectRevert(
            () => networkExit.connect(random).forceMinipoolExit(minipool.address, { value: fee }),
            "Minipool is finalised",
        );
        assert.equal(await predeploy.requestCount(), 0n);
        assert.equal(await networkExit.getRequestedEth(), 16n * ETHER);
    });
});

describe("RocketNetworkExit minipool accounting", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("node");
        await rp131.nodes.setWithdrawalAddress("node", "nodeWithdrawal", { confirm: true });
        await rp131.nodes.stakeMinimumRpl("node", { minipools: 1, bond: parseEther("16") });
        await rp131.depositPool.fund("depositor", parseEther("16"));
        await rp131.minipools.create("pool", { node: "node", bond: parseEther("16") });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool");
        await rp131.upgradeTo("current");
    });

    it("keeps requested ETH until permissionless post-distribution settlement", async () => {
        const current = await load().ensure("current");
        const networkExit = current.contracts.rocketNetworkExit;
        const minipoolAddress = current.minipools.get("pool").address;
        const random = await current.context.actor("random");

        await expectRevert(
            () => networkExit.connect(random).requestMinipoolExit(minipoolAddress),
            "Invalid minipool exit requester",
        );
        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await (await networkExit.connect(signer).requestMinipoolExit(minipoolAddress)).wait();
        });

        assert.equal(await networkExit.getMinipoolExitRequestCount(minipoolAddress), 1n);
        assert.equal(await networkExit.getMinipoolExpectedUserCapital(minipoolAddress), 16n * ETHER);
        assert.equal(await networkExit.getRequestedEth(), 16n * ETHER);
        await expectRevert(
            () => networkExit.connect(random).settleMinipoolExit(minipoolAddress),
            "Minipool has not distributed",
        );

        await distributeMinipoolBalanceAndAssert(current, "pool", {
            balance: 32n * ETHER,
            expectedUser: 16n * ETHER,
            expectedNode: 16n * ETHER,
        });
        assert.equal(await networkExit.getRequestedEth(), 16n * ETHER);

        await (await networkExit.connect(random).settleMinipoolExit(minipoolAddress)).wait();
        assert.equal(await networkExit.getRequestedEth(), 0n);
        assert.equal(await networkExit.getMinipoolExpectedUserCapital(minipoolAddress), 0n);
        assert.equal(await networkExit.getMinipoolCooperativeExitStart(minipoolAddress), 0n);
        assert.equal(await networkExit.getMinipoolExitRequestCount(minipoolAddress), 1n);
        await expectRevert(
            () => networkExit.connect(random).settleMinipoolExit(minipoolAddress),
            "Minipool exit is not requested",
        );
    });
});

describe("RocketNetworkExit legacy minipool penalties", () => {
    before(async () => {
        const rp131 = await load().ensure("1.3.1");
        await rp131.nodes.register("legacyNode");
        await rp131.nodes.setWithdrawalAddress("legacyNode", "legacyNodeWithdrawal", { confirm: true });
        await rp131.nodes.stakeMinimumRpl("legacyNode", { minipools: 2, bond: parseEther("8") });
        await rp131.depositPool.fund("pool16Depositor", parseEther("16"));
        await rp131.minipools.create("pool16", { node: "legacyNode", bond: parseEther("16") });
        await rp131.depositPool.fund("pool8Depositor", parseEther("24"));
        await rp131.minipools.create("pool8", { node: "legacyNode", bond: parseEther("8") });
        await rp131.time.advanceMinipoolScrubPeriod();
        await rp131.minipools.stake("pool16");
        await rp131.minipools.stake("pool8");
        const current = await rp131.upgradeTo("current");
        await current.minipools.setMaximumPenaltyRate(ETHER);
        await current.context.fixtures.minipoolPenaltyController.deploy("legacyPenaltySeeder");
    });

    it("converts the first fixed penalty for 16 ETH and 8 ETH bonds and reconciles accounting", async () => {
        const current = await load().ensure("current");
        const networkExit = current.contracts.rocketNetworkExit;
        await current.megapools.disableProofVerification();

        for (const [name, bond, userCapital, expectedRate] of [
            ["pool16", 16n * ETHER, 16n * ETHER, parseEther("0.00625")],
            ["pool8", 8n * ETHER, 24n * ETHER, parseEther("0.0125")],
        ] as const) {
            await requestMinipoolExit(current, current.minipools.get(name).address);
            const requestTime = await networkExit.getMinipoolLastExit(current.minipools.get(name).address);
            const receipt = await penaliseAfterCooperativePhase(current, name);

            assert.equal(minipoolPenaltyAmount(networkExit, receipt), parseEther("0.1"));
            assert.equal(expectedRate, parseEther("0.1") * ETHER / bond);
            assert.equal(await current.minipools.penaltyRate(name), expectedRate);
            assert.deepEqual(await legacyPenaltyState(current, name), {
                penaltyRate: expectedRate,
                requestedEth: 0n,
                expectedUserCapital: 0n,
                cooperativeExitStart: 0n,
                requestCount: 1n,
                lastExit: requestTime,
            });

            await distributeMinipoolBalanceAndAssert(current, name, {
                balance: 32n * ETHER,
                expectedUser: userCapital + parseEther("0.1"),
                expectedNode: bond - parseEther("0.1"),
            });
        }
    });

    it("applies three penalty and retry backoff cycles at their exact boundaries", async () => {
        const current = await load().ensure("current");
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool16");
        const settings = current.contracts.rocketDAOProtocolSettingsNetwork;
        const random = await current.context.actor("random");
        const basePenalty = await settings.getDidNotExitPenaltyBase();
        const retryBase = await settings.getDidNotExitBase();
        const backoff = await settings.getDidNotExitBackoff();
        let cumulativeRate = 0n;
        await current.megapools.disableProofVerification();

        for (let cycle = 0n; cycle < 3n; cycle++) {
            if (cycle > 0n) {
                const lastRequest = await networkExit.getMinipoolLastExit(minipool.address);
                const retryDelay = cycle === 1n
                    ? retryBase
                    : retryBase * backoff / ETHER;
                const retryAt = lastRequest + retryDelay;
                await setNextBlockTimestamp(retryAt - 1n);
                await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
                    await expectRevert(
                        () => networkExit.connect(signer).requestMinipoolExit(minipool.address),
                        "Not enough time has passed",
                    );
                });
                await setNextBlockTimestamp(retryAt);
            }

            await requestMinipoolExit(current, minipool.address);
            const nominalPenalty = cycle === 0n
                ? basePenalty
                : cycle === 1n
                    ? basePenalty * backoff / ETHER
                    : basePenalty * backoff / ETHER * backoff / ETHER;
            const receipt = await penaliseAfterCooperativePhase(current, "pool16");
            cumulativeRate += nominalPenalty * ETHER / (16n * ETHER);

            assert.equal(minipoolPenaltyAmount(networkExit, receipt), nominalPenalty);
            assert.equal(await current.minipools.penaltyRate("pool16"), cumulativeRate);
            assert.equal(await networkExit.getMinipoolExitRequestCount(minipool.address), cycle + 1n);
            assert.equal(await networkExit.getRequestedEth(), 0n);
            assert.equal(await networkExit.getMinipoolCooperativeExitStart(minipool.address), 0n);
        }

        const thirdRetryDelay = retryBase * backoff / ETHER * backoff / ETHER;
        const thirdRetryAt = (await networkExit.getMinipoolLastExit(minipool.address)) + thirdRetryDelay;
        await setNextBlockTimestamp(thirdRetryAt + 365n * 24n * 60n * 60n);
        await asNetworkContract(current, "rocketNetworkRedemptions", async signer => {
            await (await networkExit.connect(signer).requestMinipoolExit(minipool.address)).wait();
        });
        assert.equal(await networkExit.getMinipoolExitRequestCount(minipool.address), 4n);

        const fourthRequestTimestamp = await current.time.latest();
        await expectRevert(
            () => networkExit.connect(random).penaliseMinipool(
                minipool.address,
                fourthRequestTimestamp,
                legacyValidatorProof(minipool.pubkey),
                slotProof(0n),
                { value: 1n },
            ),
            "Unexpected exit fee",
        );
    });

    it("adds to an existing legacy penalty rate", async () => {
        const current = await load().ensure("current");
        const existingRate = parseEther("0.01");
        await current.context.fixtures.minipoolPenaltyController
            .get("legacyPenaltySeeder").setRate("pool16", existingRate);
        await current.megapools.disableProofVerification();
        await requestMinipoolExit(current, current.minipools.get("pool16").address);
        const receipt = await penaliseAfterCooperativePhase(current, "pool16");

        assert.equal(minipoolPenaltyAmount(current.contracts.rocketNetworkExit, receipt), parseEther("0.1"));
        assert.equal(
            await current.minipools.penaltyRate("pool16"),
            existingRate + parseEther("0.00625"),
        );
    });

    it("collects combined oDAO and exit penalties after subsequent oDAO updates for both bond sizes", async () => {
        const current = await load().ensure("current");
        await current.megapools.disableProofVerification();
        for (const name of ["trusted1", "trusted2", "trusted3"]) {
            await current.nodes.register(name);
            await current.odao.members.bootstrap(name, { id: name, url: "node@home.com" });
        }
        for (const [name, bond] of [["pool16", 16n * ETHER], ["pool8", 8n * ETHER]] as const) {
            const vote = async (block: bigint) => {
                for (const caller of ["trusted1", "trusted2"]) {
                    await submitMinipoolPenaltyScenario(current, { minipool: name, caller, block });
                }
            };
            for (let block = 1n; block <= 3n; block++) await vote(block);
            const address = current.minipools.get(name).address;
            await requestMinipoolExit(current, address);
            const receipt = await penaliseAfterCooperativePhase(current, name);
            assert.equal(minipoolPenaltyAmount(current.contracts.rocketNetworkExit, receipt), parseEther("0.1"));
            assert.equal(await current.contracts.rocketNetworkPenalties.getPenaltyCount(address), 3n);
            assert.equal(await current.contracts.rocketNetworkExit.getRequestedEth(), 0n);
            assert.equal(await current.contracts.rocketNetworkExit.getMinipoolCooperativeExitStart(address), 0n);
            await vote(4n);
            const rate = parseEther("0.2") + parseEther("0.1") * ETHER / bond;
            assert.equal(await current.minipools.penaltyRate(name), rate);
            const deduction = bond * rate / ETHER;
            await distributeMinipoolBalanceAndAssert(current, name, {
                balance: 32n * ETHER,
                expectedNode: bond - deduction,
                expectedUser: 32n * ETHER - bond + deduction,
            });
        }
    });

    it("rolls back request accounting and rate contributions if combined rate publication fails", async () => {
        const current = await load().ensure("current");
        await current.megapools.disableProofVerification();
        const address = current.minipools.get("pool16").address;
        await requestMinipoolExit(current, address);
        const stateBefore = await legacyPenaltyState(current, "pool16");
        const storage = current.contracts.rocketStorage;
        const key = (prefix: string) => ethers.solidityPackedKeccak256(["string", "address"], [prefix, address]);
        const penaltyAddress = await current.contracts.rocketMinipoolPenalty.getAddress();
        const code = await ethers.provider.getCode(penaltyAddress);
        const phase = await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
        await current.time.advance(phase);
        // Make the external rate publisher revert after the contributions have been written.
        await network.provider.send("hardhat_setCode", [penaltyAddress, "0x60006000fd"]);
        try {
            await expectRevert(() => penaliseLegacyMinipool(current, "pool16", stateBefore.cooperativeExitStart + phase));
            assert.equal(await storage.getBool(key("network.penalties.rate.initialised")), false);
            assert.equal(await storage.getUint(key("network.penalties.rate.odao")), 0n);
            assert.equal(await storage.getUint(key("network.penalties.rate.exit")), 0n);
            assert.equal(await storage.getUint(key("minipool.penalty.rate")), 0n);
        } finally {
            await network.provider.send("hardhat_setCode", [penaltyAddress, code]);
        }
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), stateBefore);
        await penaliseLegacyMinipool(current, "pool16", stateBefore.cooperativeExitStart + phase);
        assert.equal(await current.minipools.penaltyRate("pool16"), parseEther("0.00625"));
        assert.equal(await current.contracts.rocketNetworkExit.getRequestedEth(), 0n);
    });

    it("caps the effective rate without truncating the stored rate", async () => {
        const current = await load().ensure("current");
        await current.minipools.setMaximumPenaltyRate(parseEther("0.005"));
        await current.megapools.disableProofVerification();
        await requestMinipoolExit(current, current.minipools.get("pool16").address);
        await penaliseAfterCooperativePhase(current, "pool16");

        assert.equal(await current.minipools.penaltyRate("pool16"), parseEther("0.005"));
        await distributeMinipoolBalanceAndAssert(current, "pool16", {
            balance: 32n * ETHER,
            expectedUser: parseEther("16.08"),
            expectedNode: parseEther("15.92"),
        });

        await current.minipools.setMaximumPenaltyRate(ETHER);
        assert.equal(await current.minipools.penaltyRate("pool16"), parseEther("0.00625"));
    });

    for (const [description, balance] of [
        ["rewards", 36n * ETHER],
        ["a balance shortfall", parseEther("16.05")],
    ] as const) {
        it(`applies the legacy percentage as a best-effort penalty with ${description}`, async () => {
            const current = await load().ensure("current");
            await current.megapools.disableProofVerification();
            await requestMinipoolExit(current, current.minipools.get("pool16").address);
            await penaliseAfterCooperativePhase(current, "pool16");

            const details = await current.minipools.details("pool16");
            const rate = await current.minipools.penaltyRate("pool16");
            const unpenalisedNodeShare = calculateUnpenalisedNodeShare(details, balance);
            const deduction = unpenalisedNodeShare * rate / ETHER;
            if (description === "rewards") assert(deduction > parseEther("0.1"));
            else assert(deduction < parseEther("0.1"));
            assert(deduction <= unpenalisedNodeShare);

            await distributeMinipoolBalanceAndAssert(current, "pool16", {
                balance,
                expectedUser: balance - unpenalisedNodeShare + deduction,
                expectedNode: unpenalisedNodeShare - deduction,
            });
        });
    }

    it("rejects invalid targets, timings, and proofs without changing penalty state", async () => {
        const current = await load().ensure("current");
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool16");
        const random = await current.context.actor("random");
        const randomAddress = await random.getAddress();
        const guardian = await current.context.guardian();
        await current.megapools.disableProofVerification();
        const initialTimestamp = await current.time.latest();

        await expectRevert(
            () => networkExit.connect(random).penaliseMinipool(
                randomAddress,
                initialTimestamp,
                legacyValidatorProof(minipool.pubkey),
                slotProof(0n),
            ),
            "Invalid minipool",
        );
        const unrequestedState = await legacyPenaltyState(current, "pool16");
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", initialTimestamp),
            "Force exit has not been requested",
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), unrequestedState);

        await requestMinipoolExit(current, minipool.address);
        const requestedState = await legacyPenaltyState(current, "pool16");
        const phase = await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
        const deadline = requestedState.cooperativeExitStart + phase;
        const beforeDeadlineTimestamp = await current.time.latest();
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", beforeDeadlineTimestamp),
            "Not enough time has passed",
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);

        await setNextBlockTimestamp(deadline);
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", deadline - 1n),
            "Not enough time has passed",
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);

        await setNextBlockTimestamp(deadline + 3601n);
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", deadline),
            "Slot proof too old",
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);

        await (await current.contracts.beaconStateVerifier.connect(guardian).setDisabled(false)).wait();
        const invalidProofTimestamp = await current.time.latest();
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", invalidProofTimestamp),
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);
        await (await current.contracts.beaconStateVerifier.connect(guardian).setDisabled(true)).wait();

        const semanticProofTimestamp = await current.time.latest();
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", semanticProofTimestamp, { pubkey: "0x1234" }),
            "Incorrect validator",
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);
        await expectRevert(
            () => penaliseLegacyMinipool(current, "pool16", semanticProofTimestamp, { exitEpoch: 1n }),
        );
        assert.deepEqual(await legacyPenaltyState(current, "pool16"), requestedState);

        await penaliseLegacyMinipool(current, "pool16", semanticProofTimestamp);
        assert.equal(await current.minipools.penaltyRate("pool16"), parseEther("0.00625"));
        assert.equal(await networkExit.getRequestedEth(), 0n);
    });

    it("uses the delegate active at enforcement time when switching from v3 to v4", async () => {
        const current = await load().ensure("current");
        const fee = 3n;
        const predeploy = await installWithdrawalRequestPredeploy(fee);
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool16");
        const random = await current.context.actor("random");
        assert.equal((await current.minipools.delegate("pool16")).version, 3);

        await requestMinipoolExit(current, minipool.address);
        await current.minipools.delegateUpgrade("pool16");
        assert.equal((await current.minipools.delegate("pool16")).version, 4);
        const requestTime = await networkExit.getMinipoolCooperativeExitStart(minipool.address);
        const phase = await current.contracts.rocketDAOProtocolSettingsNetwork.getCooperativeExitPhase();
        await setNextBlockTimestamp(requestTime + phase);
        await (await networkExit.connect(random).penaliseMinipool(
            minipool.address,
            requestTime + phase,
            legacyValidatorProof("0x"),
            slotProof(0n),
            { value: fee },
        )).wait();

        assert.equal(await predeploy.lastCaller(), minipool.address);
        assert.equal(await current.minipools.penaltyRate("pool16"), 0n);
        assert.equal(await networkExit.getRequestedEth(), 16n * ETHER);
        assert.equal(await networkExit.getMinipoolCooperativeExitStart(minipool.address), requestTime);
    });

    it("uses the delegate active at enforcement time when switching from v4 to v3", async () => {
        const current = await load().ensure("current");
        const networkExit = current.contracts.rocketNetworkExit;
        const minipool = current.minipools.get("pool16");
        await current.minipools.delegateUpgrade("pool16");
        assert.equal((await current.minipools.delegate("pool16")).version, 4);
        await requestMinipoolExit(current, minipool.address);
        await current.minipools.delegateRollback("pool16");
        assert.equal((await current.minipools.delegate("pool16")).version, 3);
        await current.megapools.disableProofVerification();
        await penaliseAfterCooperativePhase(current, "pool16");

        assert.equal(await current.minipools.penaltyRate("pool16"), parseEther("0.00625"));
        assert.equal(await networkExit.getRequestedEth(), 0n);
        assert.equal(await networkExit.getMinipoolCooperativeExitStart(minipool.address), 0n);
    });
});
