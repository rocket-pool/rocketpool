import {
    artifacts, RocketDAONodeTrusted, RocketDAONodeTrustedSettingsProposals,
    RocketDAONodeTrustedUpgrade, RocketDAOProtocol,
    RocketDAOProtocolSettingsDeposit, RocketDAOProtocolSettingsProposals,
    RocketDepositPool,
    RocketMinipoolDelegate,
    RocketNodeDistributorFactory, RocketRewardsPool,
} from '../test/_utils/artifacts.js';
import pako from 'pako';
// import { getValidatorInfo } from '../test/_helpers/megapool';
import fs from 'fs';
import { injectBNHelpers } from '../test/_helpers/bn';
import { Interface } from 'ethers';

const ethers = hre.ethers;

injectBNHelpers();

// const rocketStorageAddress = '0xF1ab701bDbc5e3628e97d5416aA8BCc1eB4838c1'; // Scratchnet-4
// const rocketStorageAddress = '0x8a7FB51dAdF638058fBB3f7357c6b5dFbCd2687C'; // Devnet
// const rocketStorageAddress = '0xb5E573454086c1ddbd66F27DCCE29426D7689ECC'; // Devnet-3v2
const rocketStorageAddress = '0x594Fb75D3dc2DFa0150Ad03F99F97817747dd4E1'; // Testnet
// const rocketStorageAddress = '0xf4D539F1babDAa6E47b1112Bc9Fa1C83cF0FfE59'; // Devnet-4
// const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46';

function compressABI(abi) {
    return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
}

export function decompressABI(abi) {
    return JSON.parse(pako.inflate(Buffer.from(abi, 'base64'), { to: 'string' }));
}

function loadABI(abiFilePath) {
    return JSON.parse(fs.readFileSync(abiFilePath));
}

const startOffset = 256n - 64n;
const endOffset = 256n - 128n;
const lengthOffset = 256n - 192n;
const uint64Mask = BigInt('0xffffffffffffffff');

// const linkedListStorage = LinkedListStorage.at('0x15c13FA4C2FFBAeeF804CB58fFE215aD91732591');

export async function findInQueue(megapoolAddress, validatorId, queueKey, indexOffset = 0n, positionOffset = 0n) {
    const maxSliceLength = 100n; // Number of entries to scan per call

    validatorId = BigInt(validatorId);

    // const linkedListStorage = await LinkedListStorage.deployed();
    const scan = await linkedListStorage.scan(ethers.solidityPackedKeccak256(['string'], [queueKey]), indexOffset, maxSliceLength);

    for (const entry of scan[0]) {
        if (entry[0].toLowerCase() === megapoolAddress.toLowerCase()) {
            if (entry[1] === validatorId) {
                // Found the entry
                return positionOffset;
            }
        }
        positionOffset += 1n;
    }

    if (scan[1] === 0n) {
        // We hit the end of the queue without finding the entry
        return null;
    } else {
        // Nothing in this slice, recurse until end of queue is reached
        return await findInQueue(megapoolAddress, validatorId, queueKey, scan[1], positionOffset);
    }
}

export async function calculatePositionInQueue(megapool, validatorId) {
    const { expressUsed } = await getValidatorInfo(megapool, validatorId);

    const queueKeyString = expressUsed ? 'deposit.queue.express' : 'deposit.queue.standard';
    const position = await findInQueue(megapool.target, validatorId, queueKeyString);

    if (position === null) {
        // Not found in the queue
        return null;
    }

    // const linkedListStorage = await LinkedListStorage.deployed();
    const rocketDepositPool = await RocketDepositPool.deployed();
    const rocketDAOProtocolSettingsDeposit = await RocketDAOProtocolSettingsDeposit.deployed();

    const expressQueueLength = await linkedListStorage.getLength(ethers.solidityPackedKeccak256(['string'], ['deposit.queue.express']));
    const standardQueueLength = await linkedListStorage.getLength(ethers.solidityPackedKeccak256(['string'], ['deposit.queue.standard']));
    const queueIndex = await rocketDepositPool.getQueueIndex();
    const expressQueueRate = await rocketDAOProtocolSettingsDeposit.getExpressQueueRate();
    const queueInterval = expressQueueRate + 1n;

    if (expressUsed) {
        let standardEntriesBefore = (position + (queueIndex % queueInterval)) / expressQueueRate;
        if (standardEntriesBefore > standardQueueLength) {
            standardEntriesBefore = standardQueueLength;
        }
        return position + standardEntriesBefore;
    } else {
        let expressEntriesBefore = (position * expressQueueLength) + (expressQueueRate - (queueIndex % queueInterval));
        if (expressEntriesBefore > expressQueueLength) {
            expressEntriesBefore = expressQueueLength;
        }
        return position + expressEntriesBefore;
    }
}

async function bootstrapUpgrade(type, name, abi, target, { from }) {
    // const rocketDAONodeTrustedUpgrade = await RocketDAONodeTrustedUpgrade.deployed();
    const rocketDAONodeTrustedUpgrade = RocketDAONodeTrustedUpgrade.at('0xE1F9E44d8Fb154c0eF86C826918BF3186eEf1AE9');
    await (await rocketDAONodeTrustedUpgrade.connect(from).bootstrapUpgrade(type, name, abi, target)).wait();
}

export async function go() {
    const [guardian] = await ethers.getSigners();
    await artifacts.loadFromDeployment(rocketStorageAddress);
    const rocketDAONodeTrusted = (await RocketDAONodeTrusted.deployed()).connect(guardian);
    const rocketDAONodeTrustedSettingsProposals = await RocketDAONodeTrustedSettingsProposals.deployed()

    const currentVoteDelayTime = await rocketDAONodeTrustedSettingsProposals.getVoteDelayTime()
    console.log(`Current value: ${currentVoteDelayTime}`)

    await rocketDAONodeTrusted.connect(guardian).bootstrapSettingUint('rocketDAONodeTrustedSettingsProposals', 'proposal.cooldown.time', 60);
}

function old() {
    // const delegateAbi = artifacts.require('RocketMinipoolDelegate').abi;
    // const proxyAbi = artifacts.require('RocketMinipoolBase').abi;
    // const rocketMegapoolAbi = [...delegateAbi, ...proxyAbi].filter(fragment => fragment.type !== 'constructor');
    // console.log(JSON.stringify(rocketMegapoolAbi, null, 2));
    // console.log(compressABI(rocketMegapoolAbi));

    // const StorageHelper = artifacts.require('StorageHelper');

    // const storageHelperAddress = '0x3293eB907B81310EaE55f6bc83393D9632C09665';
    // const storageHelper = artifacts.require('StorageHelper').at(storageHelperAddress);
    //
    // const tx = storageHelper.setUint(ethers.solidityPackedKeccak256(['string'], ['rewards.pool.claim.interval.time.start']), 1764511104);
    // console.log(tx);

    // const iface = new Interface(StorageHelper.abi);
    // console.log(iface.encodeFunctionData('setUint', [
    //     ethers.solidityPackedKeccak256(['string'], ['rewards.pool.claim.interval.time.start']),
    //     1764511104,
    // ]));

    // const rocketRewardsPoolAddress = '0x9f94efd898aA8612A1D45C6afc020442B553488B'; // Emphemery

    // const iface = new Interface(RocketRewardsPool.abi)
    // const result = iface.decodeFunctionData('submitRewardSnapshot', '0x5d3e8ffa0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000103b900000000000000000000000000000000000000000000000000000000000139dfb2b11d89ce98307ced6e620dacef266164e672ff13014c22bdcf46864ed8405d0000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000343bab28172cbb6d3000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000023e905ab8feec0db00000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000005b686b86288e47fee800000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000')
    // console.log(result);

    // const rocketRewardsPool = RocketRewardsPool.at(rocketRewardsPoolAddress);
    // console.log(await rocketRewardsPool.getClaimIntervalTimeStart());
    // console.log(await rocketRewardsPool.getClaimIntervalsPassed());
    // const rocketTokenRPLAddress = '0x594bA8cBbB5fc650BaB6227F06c62FEa1c8D7aaB'; // Emphemery
    // const rocketTokenRPL = RocketTokenRPL.at(rocketTokenRPLAddress);
    // console.log(await rocketTokenRPL.getInflationIntervalStartTime());

    // const rocketVaultAddress = '0x18E2C4eE58e830166258177BE18f8d09b47Ba8d1'
    // const rocketVault = RocketVault.at(rocketVaultAddress);
    // console.log(await rocketVault.balanceOfToken("rocketRewardsPool", rocketTokenRPLAddress))
    // console.log(JSON.stringify(RocketRewardsPool.abi));
}

export async function stuff() {
    // const [guardian] = await ethers.getSigners();
    // await artifacts.loadFromDeployment(rocketStorageAddress);
    // const rocketMinipoolManager = await RocketMinipoolManager.deployed();
    // const rocketNodeManager = await RocketNodeManager.deployed();
    // const rocketStorage = RocketStorage.at(rocketStorageAddress);
    //
    // const nodeCount = Number(await rocketNodeManager.getNodeCount());
    // const rocketMinipoolManager = await RocketMinipoolManager.at('0xF82991Bd8976c243eB3b7CDDc52AB0Fc8dc1246C');
    // const rocketNodeStaking = await RocketNodeStaking.at('0xF18Dc176C10Ff6D8b5A17974126D43301F8EEB95');
    // const rocketNetworkSnapshots = await RocketNetworkSnapshots.at('0x7603352f1C4752Ac07AAC94e48632b65FDF1D35c');
    // const rocketStorage = await RocketStorage.at('0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46');

    // 0xC0ffEE16Ee76bF4b6423437e0C05fBF4421AaDfA

    // const affectedMinipools = [
    //     '0xCFa536870E9c62279d29e23D3BED0A8A2380B49E',
    //     '0xA379dCcbc3fFD7230C19B9823c3974a264a44Ae2',
    //     '0x51c6451f8C236abace363E07d2e95002C1F19261',
    //     '0x393e10e682bbbf8fcd51FdC4A60df7B8f4db7f32',
    //     '0xCFD0b06CD51F03e565FE593685537B45DcAD4d4E',
    //     '0xa0c6f60a09A512cD2F259D44Ee049F114475fA5f',
    //     '0xdd5255605830a3A5c698d6b1C1134A65359B65C1',
    //     '0xFD827FF7A8FE439A92D7389B8D78C194e310424a',
    //     '0xce8a6440e8BBfEE059469c6ffE107aA571902956',
    //     '0xc402f5C68B79544D6EC71757E5292ecCFc2b29A7',
    //     '0x3B29C7a245A668159c9528046D56364e84e8Aecc',
    //     '0x8d1094464e0e276DD74fa6F97A074A62211fa254',
    //     '0xBEB6F2CfCF3655453E927Aa6Ef62d7233419064e',
    //     '0x15D5c0d1bE3d134CDAC4c458CBF04F716c4Ab899',
    //     '0x911977960e3655f78BdB6a481ca407cb03Bd488d',
    // ];
    //
    // for (const minipoolAddress of affectedMinipools) {
    //     const minipool = await RocketMinipoolDelegate.at(minipoolAddress);
    //     const node = await minipool.getNodeAddress();
    //     const ratio = await rocketNodeStaking.getNodeETHCollateralisationRatio(node);
    //     const provided = await rocketNodeStaking.getNodeETHProvided(node);
    //     const matched = await rocketNodeStaking.getNodeETHMatched(node);
    //     const minipoolCount = await rocketMinipoolManager.getNodeActiveMinipoolCount(node);
    //
    //     console.log(`${minipoolAddress} ${node} ${provided} ${matched} ${ratio} ${minipoolCount}`);
    // }

    // const node = '0xca317A4ecCbe0Dd5832dE2A7407e3c03F88b2CdD';
    //
    // const blocks =
    // [
    //     20149100n,
    //     20149118n,
    //     20995895n,
    //     21002092n,
    //     21039660n,
    //     21039731n,
    //     21051639n,
    //     21083353n,
    //     21083357n,
    //     21083361n,
    // ]
    //
    // let current = 0n;
    //
    // const matchedKey = ethers.solidityPackedKeccak256(['string', 'address'], ["eth.matched.node.amount", node]);
    // const activeKey = ethers.solidityPackedKeccak256(['string', 'address'], ["minipools.active.count", node]);
    //
    // const legacy = await rocketStorage.getUint(matchedKey);
    // console.log(`Legacy: ${legacy}`);
    //
    // for (const block of blocks) {
    //     const matchedValue = await rocketNetworkSnapshots.lookup(matchedKey, block);
    //     const activeValue = await rocketNetworkSnapshots.lookup(activeKey, block);
    //     const diff = current - matchedValue;
    //     console.log(`${block} - ${activeValue} ${matchedValue} ${diff}`);
    //     current = matchedValue;
    // }
    //
    // // process.exit(0);
    //
    // const node = '0xbE016160562388d912B7Fb98AED5a4dF61d75Df8';
    // const count = await rocketMinipoolManager.getNodeMinipoolCount(node);
    //
    // let totalNodeBalance = 0n;
    // let totalUserBalance = 0n;
    //
    // let count16 = 0n;
    // let count8 = 0n;
    //
    // for (let i = 0n; i < count; i++) {
    //     const minipoolAddress = await rocketMinipoolManager.getNodeMinipoolAt(node, i);
    //     const minipool = await RocketMinipoolDelegate.at(minipoolAddress);
    //
    //     const status = await minipool.getStatus();
    //
    //     const userBalance = await minipool.getUserDepositBalance();
    //     const nodeBalance = await minipool.getNodeDepositBalance();
    //
    //     console.log(`#${i},${status},${minipoolAddress},${nodeBalance},${userBalance}`);
    //
    //     if (nodeBalance === 16000000000000000000n) {
    //         count16++;
    //     } else {
    //         count8++;
    //     }
    //
    //     totalNodeBalance += nodeBalance;
    //     totalUserBalance += userBalance;
    // }
    //
    // console.log(`Count 16: ${count16}`);
    // console.log(`Count 8: ${count8}`);
    //
    // console.log(`User: ${totalUserBalance}`);
    // console.log(`Node: ${totalNodeBalance}`);
    //
    // const provided = await rocketNodeStaking.getNodeETHProvided(node);
    // const matched = await rocketNodeStaking.getNodeETHMatched(node);
    //
    // console.log(`Provided: ${provided}`);
    // console.log(`Matched: ${matched}`);

    // const vacantCount = await rocketMinipoolManager.getVacantMinipoolCount();
    // console.log(`Vacant minipool count: ${vacantCount}`);

    // const count = await rocketMinipoolManager.getMinipoolCount();
    // console.log(`Minipool count: ${count}`);
    //
    // for (let i = 0n; i < count; i++) {
    //     const minipoolAddress = await rocketMinipoolManager.getMinipoolAt(i);
    //     const minipool = await RocketMinipoolDelegate.at(minipoolAddress);
    //     const status = await minipool.getStatus();
    //
    //     if (status !== 2n) {
    //         console.log(`#${i} ${minipoolAddress} - ${status}`);
    //     }
    //
    //     if (i % 1000n === 0n) {
    //         console.log(`${i} of ${count} `);
    //     }
    // }

    let notInit = 0;
    const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();

    for (let i = 0; i < nodeCount; i++) {
        // const node = '0x5df9a9d48314eE84b3963f1BC9bc812B595AE409';
        const node = await rocketNodeManager.getNodeAt(i);

        const averageNodeFee = await rocketNodeManager.getAverageNodeFee(node);
        const initialised = await rocketNodeManager.getFeeDistributorInitialised(node);

        if (!initialised) {
            // const feeDistributorAddress = await rocketNodeDistributorFactory.getProxyAddress(node);
            // console.log(`${node}\t${feeDistributorAddress}`);
            // continue;

            const minipoolCount = await rocketMinipoolManager.getNodeMinipoolCount(node);
            if (minipoolCount > 0) {
                notInit++;
                // console.log(`# ${i}: ${averageNodeFee * 100n / '1'.ether}%`);
            } else {
                continue;
            }

            // console.log(`Minipool count: ${minipoolCount}`);

            let numerator8 = 0n;
            let numerator16 = 0n;
            let active = 0;
            let finalisedCount = 0;

            for (let j = 0; j < minipoolCount; j++) {
                const minipoolAddress = await rocketMinipoolManager.getNodeMinipoolAt(node, j);
                const minipool = RocketMinipoolDelegate.at(minipoolAddress);

                const nodeFee = await minipool.getNodeFee();
                const finalised = await minipool.getFinalised();
                const nodeDepositBalance = await minipool.getNodeDepositBalance();
                const status = await minipool.getStatus();

                if (finalised) {
                    // console.log(`  - ${j}: ${nodeFee} ${nodeDepositBalance} ${status}`);
                    finalisedCount++;
                }

                if (status === 2n && !finalised) {
                    if (nodeDepositBalance === '8'.ether) {
                        numerator8 += nodeFee;
                        active++;
                    } else {
                        numerator16 += nodeFee;
                        active++;
                    }
                }
            }

            // console.log(`Active ${active} Finalised ${finalisedCount}`);

            const numerator16Key = ethers.solidityPackedKeccak256(['string', 'address'], ['node.average.fee.numerator', node]);
            const numerator8Key = ethers.solidityPackedKeccak256(['string', 'address', 'uint256'], ['node.average.fee.numerator', node, '8'.ether]);
            const value16 = await rocketStorage.getUint(numerator16Key);
            const value8 = await rocketStorage.getUint(numerator8Key);

            // console.log(`numerator8 = ${numerator8} on chain = ${value8}`)
            // console.log(`numerator16 = ${numerator16} on chain = ${value16}`)

            // if (numerator8 !== value8 || numerator16 !== value16) {
            //     console.log(`!!! error ${node} ${numerator8} ${value8} ${numerator16} ${value16} ${averageNodeFee} ${active} ${initialised}`);
            // } else {
            //     console.log(`ok ${node}`);
            // }

            if (finalisedCount > 0) {
                console.log(`!!! error ${node} ${numerator8} ${value8} ${numerator16} ${value16} ${averageNodeFee} ${active} ${initialised}`);
            } else {
                console.log(`ok ${node}`);
            }
        }

        // let weightedAverage = 0n;
        // average = numerator /  activeCount;
        //
        // if (averageNodeFee !== average) {
        //     console.log('!!!!! Incorrect average')
        //     console.log(`Node: ${node}`);
        //     console.log(`Calculated average: ${average}`)
        //     console.log(`Average node fee: ${averageNodeFee}`);
        //     console.log()
        // }

        // console.log(`${i} of ${nodeCount} not init ${notInit}`);
        // break;
    }

    // {
    //     const rocketDAONodeTrusted = RocketDAONodeTrustedUpgrade.at('0x09FB081d4a78cCDf38C6F60a1324fFbC9653f77f');
    //     const abi = compressABI(loadABI('./contracts/contract/casper/compiled/Deposit.abi'));
    //     // console.log(abi)
    //     await (await rocketDAONodeTrusted.connect(guardian).bootstrapUpgrade("upgradeABI", "casperDeposit", abi, '0x00000000219ab540356cBB839Cbe05303d7705Fa')).wait();
    // }

    // {
    //     const rocketStorage = RocketStorage.at(rocketStorageAddress);
    //     const abi = await rocketStorage.getString(ethers.solidityPackedKeccak256(['string', 'string'], ['contract.abi', 'casperDeposit']));
    //     const decompressed = decompressABI(abi);
    //
    //     console.log(decompressed);
    // }

    // const blockRoots = artifacts.require('BlockRoots').at('0x581f43e7a51c3E71A0E89Ed7BFf7bB6Fb6B645CE')
    //
    // const beaconGenesisTime = 1742213400n;
    //
    // const block = await ethers.provider.getBlock();
    // const timestamp = BigInt(block.timestamp);
    //
    // const currentSlot = (timestamp - beaconGenesisTime) / 12n;
    // console.log(`Current Slot: `, currentSlot)
    // console.log(`Current Slot Timestamp: `, timestamp)
    // console.log(await blockRoots.getBlockRoot(currentSlot-8191n));

    // const delegateAbi = artifacts.require('RocketMegapoolDelegate').abi;
    // const proxyAbi = artifacts.require('RocketMegapoolProxy').abi;
    // const rocketMegapoolAbi = [...delegateAbi, ...proxyAbi].filter(fragment => fragment.type !== 'constructor');
    // console.log(JSON.stringify(rocketMegapoolAbi, null, 2));
    // console.log(compressABI(rocketMegapoolAbi));

    // const rocketMegapoolProxyAddress = '0xC16eF5B04C1bd583130A1fEc4e8671C895e85074'
    // const rocketMegapoolFactoryAddress = '0xca3380e1A84AA60A5b6Bfa5F710A33Ad516684Ee';
    // await bootstrapUpgrade('upgradeContract', 'rocketMegapoolProxy', compressABI(artifacts.require('RocketMegapoolProxy').abi), rocketMegapoolProxyAddress, { from: guardian })
    // await bootstrapUpgrade('upgradeContract', 'rocketMegapoolFactory', compressABI(artifacts.require('RocketMegapoolFactory').abi), rocketMegapoolFactoryAddress, { from: guardian })

    // const rocketMegapoolFactory = RocketMegapoolFactory.at('0xca3380e1A84AA60A5b6Bfa5F710A33Ad516684Ee');
    // const deployed = await rocketMegapoolFactory.getMegapoolDeployed('0x73abb8ba1DF6F24052eCCe0f58f2208b4Dc43340')
    // console.log('Is deployed: ' + deployed);

    // const rocketNetworkRevenues = RocketNetworkRevenues.at('0xf02d2F4bf00972fe990413b712b2394f0B889717')
    // const blockNumber = await ethers.provider.getBlockNumber()
    // console.log('Current block: ' + blockNumber);
    // const split = await rocketNetworkRevenues.calculateSplit(68553n)
    // console.log(split)

    // const rocketMegapoolManager = await RocketMegapoolManager.new(rocketStorageAddress)
    // const address = rocketMegapoolManager.target
    // const abi = compressABI(RocketMegapoolManager.abi)

    // const StorageHelper = artifacts.require('StorageHelper')
    //
    // const storageHelper = StorageHelper.at('0x53256C6FE23fD9B3D74C7C5994084C47E42631C8').connect(guardian)

    // bytes32 private constant nodeShareKey = keccak256(abi.encodePacked("network.revenue.node.share"));
    // bytes32 private constant voterShareKey = keccak256(abi.encodePacked("network.revenue.voter.share"));
    // bytes32 private constant protocolDAOShareKey = keccak256(abi.encodePacked("network.revenue.pdao.share"));

    // function decodeSnapshot(encoded) {
    //     const int = BigInt(encoded);
    //     const block = int >> 224n
    //     const value = int & (2n ^ 224n)
    //     return {block, value}
    // }
    //
    // const nodeShareKey = ethers.solidityPackedKeccak256(['string'], ['network.revenue.node.share'])
    // const pdaoShareKey = ethers.solidityPackedKeccak256(['string'], ['network.revenue.pdao.share'])
    // const pdaoLengthKey = ethers.solidityPackedKeccak256(['string', 'bytes32'], ['snapshot.length', pdaoShareKey]);
    //
    // const nodeSnapshot = await storageHelper.getBytes32(nodeShareKey)
    //
    // // // Set snapshot value
    // // await storageHelper.setBytes32(pdaoShareKey, nodeSnapshot);
    // // // Set snapshot length
    // // await storageHelper.setUint(pdaoLengthKey, 1n);
    //
    // const pdaoLength = await storageHelper.getUint(pdaoLengthKey);
    // console.log('New length: ' + pdaoLength)
    // const pdaoSnapshot = await storageHelper.getBytes32(pdaoShareKey)
    // console.log('pDAO snapshot: ')
    // console.log(decodeSnapshot(pdaoSnapshot));

    //
    // const rocketDAOProtocolSettingsNetwork = await RocketDAOProtocolSettingsNetwork.deployed();
    // console.log(await rocketDAOProtocolSettingsNetwork.getProtocolDAOShare());

    // const rocketNodeTrustedUpgrade = (await RocketDAONodeTrustedUpgrade.deployed()).connect(guardian);
    // await rocketNodeTrustedUpgrade.bootstrapUpgrade('upgradeContract', 'rocketMegapoolManager', abi, address);

    // const storageHelper = (await StorageHelper.deployed()).connect(guardian);
    // await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMegapoolManager', compressABI(RocketMegapoolManager.abi), rocketMegapoolManager.target, { from: guardian });
    // console.log(JSON.stringify(RocketMegapoolManager.abi, null, 2))

    // {
    //     const rocketMegapoolManager = await RocketMegapoolManager.deployed();
    //     const count = await rocketMegapoolManager.getValidatorCount()
    //
    //     for (let i = 0n; i < count; i+=1n) {
    //         const validatorInfo = await rocketMegapoolManager.getValidatorInfo(i)
    //         console.log(validatorInfo)
    //     }
    // }

    // const storageHelper = (await StorageHelper.at('0x9427b5B5826f4CaDAAe619041920235b552CBed9')).connect(guardian);
    //
    // const namespace = ethers.solidityPackedKeccak256(['string'], ['dao.protocol.setting.proposals'])
    //
    // async function setUint(namespace, path, value) {
    //     const key = ethers.solidityPackedKeccak256(['bytes32', 'string'], [namespace, path]);
    //     await storageHelper.setUint(key, value)
    // }
    //
    // async function getUint(namespace, path) {
    //     const key = ethers.solidityPackedKeccak256(['bytes32', 'string'], [namespace, path]);
    //     return await storageHelper.getUint(key)
    // }
    //
    // // await setUint(namespace, 'proposal.vote.phase1.time', 86400n)
    // // await setUint(namespace, 'proposal.vote.phase2.time', 86400n)
    // // await setUint(namespace, 'proposal.vote.delay.time', 86400n)
    //
    // console.log('Vote Phase 1 Time', await getUint(namespace, 'proposal.vote.phase1.time'))
    // console.log('Vote Phase 2 Time', await getUint(namespace, 'proposal.vote.phase2.time'))
    // console.log('Vote Delay', await getUint(namespace, 'proposal.vote.delay.time'))

    // console.log(storageHelper.target);

    // const rocketDAOProtocol = (await RocketDAOProtocol.deployed()).connect(guardian);

    // await setDaoNodeTrustedBootstrapMember("rp1", "rocketpool.net", '0xFcB7DC1BAEE1651137F9C0ea6F2E650359aDe290', { from: guardian })
    // try {
    //     await setDaoNodeTrustedBootstrapMember("rp2", "rocketpool.net", '0x9D5e78c8c8C30793F142dCc68e759B69196f6886', { from: guardian })
    // } catch(e) {}
    // try {
    //     await setDaoNodeTrustedBootstrapMember("rp3", "rocketpool.net", '0xA3819Ae703Fe88A5E6a917d0aF2c88a453bDfa44', { from: guardian })
    // } catch(e) {}
    // await rocketDAOProtocol.bootstrapEnableGovernance();

    // await rocketDAOProtocol.connect(guardian).bootstrapSettingUint('rocketDAOProtocolSettingsNode', 'node.unstaking.period', (60 * 15));

    // const rocketDepositPool = RocketDepositPool.at('0xB207A827E6a37259A9331238e02f57652e584509');
    //
    // const megapool = RocketMegapoolDelegate.at("0x3EB98dd3d1303E5e18819761661ef964e2a56B9E");
    // // console.log(await megapool.getActiveValidatorCount());
    // // console.log(await megapool.getValidatorCount());
    //
    // console.log('Standard queue length: ' + await rocketDepositPool.getStandardQueueLength());
    // console.log('Express queue length: ' + await rocketDepositPool.getExpressQueueLength());

    // for (let i = 0n; i < 3n; i += 1n) {
    //     console.log(`Validator in position ${i+1n} is ` + await calculatePositionInQueue(megapool, i+1n))
    // }

    // const megapoolAddress = '0x99a96EafFAcafA02ad45eF0Ea241D570A35A4519';
    // console.log('Position in standard queue for validator 1 is ' + await findInQueue(linkedListStorage, megapool.target, 1n, 'deposit.queue.standard'))
    // console.log('Position in express queue for for validator 2 is ' + await findInQueue(linkedListStorage, megapool.target, 2n, 'deposit.queue.express'))
    // console.log('Position in standard queue for validator 3 is ' + await findInQueue(linkedListStorage, megapool.target, 3n, 'deposit.queue.standard'))

    // const expressQueueKey = ethers.solidityPackedKeccak256(['string'], ['deposit.queue.express'])
    // const standardQueueKey = ethers.solidityPackedKeccak256(['string'], ['deposit.queue.standard'])
    //
    // const results = await linkedListStorage.scan(expressQueueKey, 0, 20);
    // //
    // // // console.log(results[0].length);
    // console.log(results[0]);

    //0x8FCC27e7497A0968e105b83a7dAB3BfE1171C97d

    // uint256 data = getUint(keccak256(abi.encodePacked(_namespace, ".data")));

    // const data = await rocketStorage.getUint(ethers.solidityPackedKeccak256(['bytes32', 'string'], [standardQueueKey, '.data']));
    // const queueLen = (data >> lengthOffset) & uint64Mask;
    // const queueStart = (data >> startOffset) & uint64Mask;
    // const queueEnd = (data >> endOffset) & uint64Mask;
    //
    // console.log(queueStart)
    // console.log(queueEnd)
    // console.log(queueLen)
    //
    // for (let i = 0n; i < queueEnd + 1n; i += 1n) {
    //     const dataKey = ethers.solidityPackedKeccak256(['bytes32', 'string', 'uint256'], [standardQueueKey, '.item', i]);
    //     const nextKey = ethers.solidityPackedKeccak256(['bytes32', 'string', 'uint256'], [standardQueueKey, '.next', i]);
    //     const packedData = await rocketStorage.getUint(dataKey);
    //     const next = await rocketStorage.getUint(nextKey);
    //     console.log(`${i}: ${next} = ${packedData}`);
    // }
    //
    // const megapool = RocketMegapoolDelegate.at('0x99a96eaffacafa02ad45ef0ea241d570a35a4519');
    // const rewards = await megapool.calculateRewards('1'.ether);
    // console.log(rewards);
    // console.log(await megapool.getPendingRewards());

    // const key = ethers.solidityPackedKeccak256(['string', 'uint256'], ['megapool.validator.set', 1])
    // const rocketStorage = await RocketStorage.at(rocketStorageAddress);
    // console.log(await rocketStorage.getUint(key));
    // process.exit(0);

    // Deploy upgrade helper
    // {
    //
    // const rocketDepositPool = await RocketDepositPool.new(rocketStorageAddress);
    // console.log(`Deployed deposit pool to: ${rocketDepositPool.target}`)
    //
    // const rocketNodeDeposit = await RocketNodeDeposit.new(rocketStorageAddress);
    // console.log(`Deployed node deposit to: ${rocketNodeDeposit.target}`)
    //
    // const upgradeHelper = await MegapoolUpgradeHelper.new(rocketStorageAddress);
    // console.log(`Deployed upgrade helper to: ${upgradeHelper.target}`)
    //
    // await setDaoNodeTrustedBootstrapUpgrade('addContract', 'upgradeHelper', compressABI(MegapoolUpgradeHelper.abi), upgradeHelper.target, { from: guardian });

    // const rocketMegapoolDelegate = await RocketMegapoolDelegate.new(rocketStorageAddress);
    // console.log(`Deployed megapool delegate to: ${rocketMegapoolDelegate.target}`)
    // const upgradeHelperAddress = '0xf2E953D6973B5d657f758E4FC3c27A7CBc1879E4';
    // const upgrader = MegapoolUpgradeHelper.at(upgradeHelperAddress).connect(guardian);
    // await upgrader.upgradeDelegate('0x0097dA0269584dA4188b59440AC266E0AF93A9E7')

    // const linkedListStorage = await LinkedListStorage.new(rocketStorageAddress);
    // console.log(`Deployed linked list storage: ${linkedListStorage.target}`)
    //
    // const rocketNodeManager = await RocketNodeManager.new(rocketStorageAddress);
    // console.log(`Deployed rocket node manager: ${rocketNodeManager.target}`)

    // const blockRoots = BlockRoots.at('0x358E0964A806Bb9F10421D5d34d8174A85FA66E3')

    // const timestamp = await blockRoots.getTimestampFromSlot(572341n)
    // const root = await blockRoots.getBlockRoot(572340n);
    // console.log('Timestamp: ' + timestamp)
    // console.log('Root: ' + root)

    // constructor(uint256 _genesisBlockTimestamp, uint256 _secondsPerSlot, uint256 _beaconRootsHistoryBufferLength, address _beaconRoots) {

    // genesisBlockTimestamp: 1742213400n,
    //     secondsPerSlot: 12n,
    //     beaconRootsHistoryBufferLength: 8192n,
    //     historicalRootOffset: 0n,
    //     beaconRoots: '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02',

    // const rocketDAOProtocolSettingsMegapool = await RocketDAOProtocolSettingsMegapool.new(rocketStorageAddress);
    // console.log(`Deployed rocket dao protocol settings megapool: ${rocketDAOProtocolSettingsMegapool.target}`)
    //
    // await artifacts.loadFromDeployment(rocketStorageAddress);
    // const rocketDepositPool = RocketDepositPool.at('0x04b72d20067d5bebefd0ed2a83ade58468e4cfcd');
    // console.log(await rocketDepositPool.getStandardQueueLength());

    // const rocketDepositPool = RocketDepositPool.at("0xB20d5dcd8c227c3Ca17aAef34dB8C027a49a5f70");
    // console.log(await rocketDepositPool.getQueueTop());

    // const BlockRoots = await artifacts.require('BlockRoots')
    // const blockRoots = '0x358E0964A806Bb9F10421D5d34d8174A85FA66E3'

    // const BlockRoots = await artifacts.require('BlockRoots')
    // const blockRoots = await BlockRoots.new(
    //     1742213400n,
    //     12n,
    //     8191n,
    //     '0x000F3df6D732807Ef1319fB7B8bB8522d0Beac02'
    // )
    //
    // const BeaconStateVerifier = await artifacts.require('BeaconStateVerifier')
    // const beaconStateVerifier = await BeaconStateVerifier.new(rocketStorageAddress, 8192n, 0n);

    // try {
    //     await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'blockRoots', compressABI(BlockRoots.abi), blockRoots.target, { from: guardian });
    // } catch (e) {}
    // try {
    //     await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'beaconStateVerifier', compressABI(BeaconStateVerifier.abi), beaconStateVerifier.target, { from: guardian });
    // } catch (e) {}
    // try {

    // } catch (e) {}

    // const upgradeHelper = MegapoolUpgradeHelper.at('0xcf71f8e767B6520936bDF54c2F68B7A28e8366ef');
    // await upgradeHelper.connect(guardian).upgradeDelegate('0x63782525426EAc34B76a0C4843B4aC73aD593a7E');

    // try {
    // } catch(e){
    //     console.error(e);
    // }

    // await rocketDepositPool.connect(guardian).fixNodeCredit('0x462eb18d5c8AEb77FB3cd82E621bAE81E13F4Ce9')

    // await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketDAOProtocolSettingsMegapool', compressABI(RocketDAOProtocolSettingsMegapool.abi), rocketDAOProtocolSettingsMegapool.target, { from: guardian });
    // await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'linkedListStorage', compressABI(LinkedListStorage.abi), '0x090d5B19933C64721eCEE4b5E14F602e98032c19', { from: guardian });
    // await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketNodeManager', compressABI(RocketNodeManager.abi), '0xdD53A327b8C615EBE2b1f2F3aB19fCb7b98C838A', { from: guardian });
    // await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMegapoolManager', compressABI(RocketMegapoolManager.abi), '0xc949B6f3d46d7366462D875B7e81642C1c90f4e8', { from: guardian });

// *** Deploy megapool
// {
//     const rocketMegapoolDelegate = await artifacts.require('RocketMegapoolDelegate');
//     const instance = await rocketMegapoolDelegate.new(rocketStorageAddress);
//     console.log(`Deployed megapool delegate to: ${instance.target}`)
//
//     const megapoolUpgradeHelper = await artifacts.require('MegapoolUpgradeHelper');
//     const upgradeHelperAddress = '0x94b9C82d6342c47D31186d3F40fA8b6035045CFC';
//     const upgrader = megapoolUpgradeHelper.at(upgradeHelperAddress).connect(guardian);
//     await upgrader.upgradeDelegate(instance.target)
// }

// // *** Upgrade Delegate
// const megapoolUpgradeHelper = await artifacts.require('MegapoolUpgradeHelper');
// const upgradeHelperAddress = '0x94b9C82d6342c47D31186d3F40fA8b6035045CFC';
// const instance = megapoolUpgradeHelper.at(upgradeHelperAddress).connect(guardian);
// await instance.upgradeDelegate('0xA4aCdcC348c7974592305fbfBD87AC0D8B480753')
//
// const delegateAbi = artifacts.require('RocketMegapoolDelegate').abi;
// const proxyAbi = artifacts.require('RocketMegapoolProxy').abi;
// const rocketMegapoolAbi = [...delegateAbi, ...proxyAbi].filter(fragment => fragment.type !== 'constructor');
// console.log(JSON.stringify(rocketMegapoolAbi, null, 2));
// console.log(compressABI(rocketMegapoolAbi));
//
// await artifacts.loadFromDeployment(rocketStorageAddress);

// Deploy upgrade helper
// {
//     const instance = await RocketMegapoolManager.new(rocketStorageAddress);
//     console.log(`Deployed manager to: ${instance.target}`)
// }

// const rocketDepositPool = RocketDepositPool.at('0x4Cd86a9583Bf779F695c24E15D1bdFf660A69295');
// console.log(await rocketDepositPool.getNodeCreditBalance("0x462eb18d5c8AEb77FB3cd82E621bAE81E13F4Ce9"));

// const linkedListABI = LinkedListStorage.abi;
// const rocketMegapoolManagerABI = RocketMegapoolManager.abi;
// const rocketNetworkRevenuesABI = RocketNetworkRevenues.abi;
//
// await artifacts.loadFromDeployment(rocketStorageAddress);
//
// await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'linkedListStorage', linkedListABI, '0x0000000000000000000000000000000000000000', { from: guardian });
// try {
//     await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketMegapoolManager', rocketMegapoolManagerABI, '0x0000000000000000000000000000000000000000', { from: guardian });
// } catch(e){}
// try {
//     await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketNetworkRevenues', rocketNetworkRevenuesABI, '0x0000000000000000000000000000000000000000', { from: guardian });
// } catch(e){}

// await setDaoNodeTrustedBootstrapUpgrade('upgradeContract', 'rocketMegapoolManager', compressABI(RocketMegapoolManager.abi), '0xEc9e119D0d1cE5ce00e86a955325B3DeB2230cD8', { from: guardian });

//
// // console.log(JSON.stringify(rocketMegapoolAbi));
// const compressed = compressABI(rocketMegapoolAbi);
// console.log('Compressed string is:')
// console.log(compressed)
// // console.log(compressABI(rocketMegapoolAbi));
//
// await setDaoNodeTrustedBootstrapUpgrade('upgradeABI', 'rocketMegapool', compressed, '0xd4F8a817821393b2020eC32a404D2931dfb09700', { from: guardian });
// await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, "network.node.commission.share", '0.10'.ether, { from: guardian });
// const rocketDAOProtocol = (await RocketDAOProtocol.deployed()).connect(guardian);
// const newValue = ethers.parseUnits('0.10', 'ether');
// console.log(newValue);
//     const rocketDAOProtocol = await RocketDAOProtocol.deployed();
//     await rocketDAOProtocol.connect(guardian).bootstrapSettingUint('rocketDAOProtocolSettingsNode', 'node.unstaking.period', (60 * 15));
// console.log(tx);

}

go().then(() => process.exit(0));