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
            () => networkExit.connect(random).forceMegapoolExitForDeficit(megapoolAddress, [0n], { value: fee }),
            "Deficit too low",
        );

        const penalty = 9n * ETHER;
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted1");
        await applyMegapoolPenaltyVoteAndAssert(current, "node", 0n, penalty, "trusted2");

        await expectRevert(
            () => networkExit.connect(random).forceMegapoolExitForDeficit(megapoolAddress, [0n, 0n], { value: fee * 2n }),
            "Already notified",
        );
        assert.equal((await megapool.getValidatorInfo(0n)).exiting, false);
        assert.equal(await predeploy.requestCount(), 0n);

        await (await networkExit.connect(random).forceMegapoolExitForDeficit(
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
