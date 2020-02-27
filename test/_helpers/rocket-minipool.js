// Dependencies
import { TimeController } from '../_lib/utils/general'
import { getValidatorPubkey, getWithdrawalCredentials, getValidatorSignature, getValidatorDepositDataRoot } from '../_lib/utils/beacon';
import { RocketAdmin, RocketNodeAPI, RocketDepositSettings, RocketMinipoolInterface, RocketMinipoolSettings, RocketNodeWatchtower } from '../_lib/artifacts';
import { userDeposit } from './rocket-deposit';


// Make minipool time out
export async function timeoutMinipool({minipoolAddress, owner}) {

    // Get contracts
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let minipool = await RocketMinipoolInterface.at(minipoolAddress);

    // Get minipool status change time and timeout period
    let minipoolTimeout = parseInt(await rocketMinipoolSettings.getMinipoolTimeout.call());
    let minipoolStatusChangeTime = parseInt(await minipool.getStatusChangedTime.call());

    // Get current block time
    let latestBlock = await web3.eth.getBlock('latest');
    let currentTime = latestBlock.timestamp;

    // Get time to advance by
    let timeDifference = minipoolTimeout + minipoolStatusChangeTime - currentTime;

    // Advance time
    if (timeDifference > 0) {
        await TimeController.addSeconds(timeDifference);
        TimeController.reset();
    }

    // Update minipool status
    await minipool.updateStatus({from: owner});

}


// Make a single minipool progress to staking
export async function stakeSingleMinipool({minipoolAddress, nodeContract, nodeOperator, groupAccessorContract, staker, depositLoops}) {

    // Get contracts
    let rocketDepositSettings = await RocketDepositSettings.deployed();
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let rocketNodeAPI = await RocketNodeAPI.deployed();

    // Get deposit settings
    let chunkSize = parseInt(await rocketDepositSettings.getDepositChunkSize.call());
    let chunksPerDepositTx = parseInt(await rocketDepositSettings.getChunkAssignMax.call());

    // Get minipool settings
    let miniPoolLaunchAmount = parseInt(await rocketMinipoolSettings.getMinipoolLaunchAmount.call());
    let miniPoolAssignAmount = Math.floor(miniPoolLaunchAmount / 2);

    // Parameters to fill initial minipool and leave change in deposit queue
    let selfAssignableDepositSize = chunkSize * chunksPerDepositTx;
    let selfAssignableDepositsPerMinipool = Math.floor(miniPoolAssignAmount / selfAssignableDepositSize);

    // Perform multiple sets of deposits if required
    if (!depositLoops) depositLoops = 1;
    for (let i = 0; i < depositLoops; ++i) {

        // Fill minipool
        for (let di = 0; di < selfAssignableDepositsPerMinipool; ++di) {
            await userDeposit({
                depositorContract: groupAccessorContract,
                durationID: '3m',
                fromAddress: staker,
                value: selfAssignableDepositSize,
            });
        }

    }

    // Get casper deposit data
    let withdrawalCredentials = await rocketNodeAPI.getWithdrawalCredentials.call();
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawal_credentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: 32000000000, // gwei
        signature: getValidatorSignature(),
    };
    let depositDataRoot = getValidatorDepositDataRoot(depositData);

    // Stake minipool
    await nodeContract.stakeMinipool(minipoolAddress, depositData.pubkey, depositData.signature, depositDataRoot, {from: nodeOperator});

}


// Make minipool log out
export async function logoutMinipool({minipoolAddress, nodeOperator, owner}) {

    // Get contracts
    let rocketNodeWatchtower = await RocketNodeWatchtower.deployed();
    let rocketAdmin = await RocketAdmin.deployed();
    let rocketNodeAPI = await RocketNodeAPI.deployed();

    // Set node status
    let nodeTrusted = await rocketNodeAPI.getTrusted.call(nodeOperator);
    if (!nodeTrusted) await rocketAdmin.setNodeTrusted(nodeOperator, true, {from: owner});

    // Logout minipool
    await rocketNodeWatchtower.logoutMinipool(minipoolAddress, {from: nodeOperator});

}


// Make minipool withdraw with balance
export async function withdrawMinipool({minipoolAddress, balance, nodeOperator, owner}) {

    // Get contracts
    let rocketNodeWatchtower = await RocketNodeWatchtower.deployed();
    let rocketAdmin = await RocketAdmin.deployed();
    let rocketNodeAPI = await RocketNodeAPI.deployed();

    // Set node status
    let nodeTrusted = await rocketNodeAPI.getTrusted.call(nodeOperator);
    if (!nodeTrusted) await rocketAdmin.setNodeTrusted(nodeOperator, true, {from: owner});

    // Withdraw minipool
    await rocketNodeWatchtower.withdrawMinipool(minipoolAddress, balance, {from: nodeOperator});

}


// Make minipool progress to backup collection enabled
export async function enableMinipoolBackupCollect({minipoolAddress}) {

    // Get contracts
    let rocketMinipoolSettings = await RocketMinipoolSettings.deployed();
    let minipool = await RocketMinipoolInterface.at(minipoolAddress);

    // Get minipool status change block and backup collect duration
    let minipoolBackupCollectDuration = parseInt(await rocketMinipoolSettings.getMinipoolBackupCollectDuration.call());
    let minipoolStatusChangeBlock = parseInt(await minipool.getStatusChangedBlock.call());

    // Get current block number
    let latestBlock = await web3.eth.getBlock('latest');
    let blockNumber = latestBlock.number;

    // Get target block to advance to
    let targetBlock = minipoolStatusChangeBlock + minipoolBackupCollectDuration;

    // Advance blocks
    while (blockNumber < targetBlock) {
        await new Promise((resolve, reject) => {
            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_mine',
                params: [],
                id: new Date().getSeconds()
            }, (error, result) => {
                if (error) reject(error);
                if (result) resolve(result.result);
            });
        });
    }

}

