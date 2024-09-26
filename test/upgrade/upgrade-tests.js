import { printTitle } from '../_utils/formatting';
import { RocketDAOProtocolSettingsProposals, RocketNodeStaking, RocketStorage } from '../_utils/artifacts';
import { setDaoNodeTrustedBootstrapUpgrade } from '../dao/scenario-dao-node-trusted-bootstrap';
import pako from 'pako';
import { assertBN } from '../_helpers/bn';
import { nodeStakeRPL, registerNode } from '../_helpers/node';
import { createMinipool, getMinipoolMinimumRPLStake } from '../_helpers/minipool';
import { mintRPL } from '../_helpers/tokens';
import { userDeposit } from '../_helpers/deposit';
import * as assert from 'assert';

export default function() {
    contract('RocketUpgradeOneDotThreeDotOne', async (accounts) => {

        // Accounts
        const [
            owner,
            node1,
            node2,
            node3,
            node4,
            random,
        ] = accounts;

        let rocketUpgradeOneDotThreeDotOne;

        const contracts = {
            rocketDAOProposal: artifacts.require('RocketDAOProposal.sol'),
            rocketDAOProtocolProposal: artifacts.require('RocketDAOProtocolProposal.sol'),
            rocketDAOProtocolVerifier: artifacts.require('RocketDAOProtocolVerifier.sol'),
            rocketDAOProtocolSettingsProposals: artifacts.require('RocketDAOProtocolSettingsProposals.sol'),
            rocketDAOProtocolSettingsAuction: artifacts.require('RocketDAOProtocolSettingsAuction.sol'),
            rocketMinipoolManager: artifacts.require('RocketMinipoolManager.sol'),
            rocketNodeStaking: artifacts.require('RocketNodeStaking.sol'),
            rocketMinipoolDelegate: artifacts.require('RocketMinipoolDelegate.sol'),
            rocketNodeDeposit: artifacts.require('RocketNodeDeposit.sol'),
            rocketNetworkVoting: artifacts.require('RocketNetworkVoting.sol'),

            rocketUpgradeOneDotThreeDotOne: artifacts.require('RocketUpgradeOneDotThreeDotOne.sol'),
        };

        let addresses = {};

        before(async () => {
            function compressABI(abi) {
                return Buffer.from(pako.deflate(JSON.stringify(abi))).toString('base64');
            }

            const rocketStorageInstance = await RocketStorage.deployed();

            // Deploy other contracts - have to be inside an async loop
            for (let contract in contracts) {
                // Only deploy if it hasn't been deployed already like a precompiled
                if (!contracts[contract].hasOwnProperty('precompiled')) {
                    let instance;

                    switch (contract) {
                        // Upgrade contract
                        case 'rocketUpgradeOneDotThreeDotOne':
                            instance = await contracts[contract].new(rocketStorageInstance.address);
                            contracts[contract].setAsDeployed(instance);
                            const args = [
                                [
                                    addresses.rocketDAOProposal,
                                    addresses.rocketDAOProtocolProposal,
                                    addresses.rocketDAOProtocolVerifier,
                                    addresses.rocketDAOProtocolSettingsProposals,
                                    addresses.rocketDAOProtocolSettingsAuction,
                                    addresses.rocketMinipoolManager,
                                    addresses.rocketNodeStaking,
                                    addresses.rocketMinipoolDelegate,
                                    addresses.rocketNodeDeposit,
                                    addresses.rocketNetworkVoting,
                                ],
                                [
                                    compressABI(contracts.rocketDAOProposal.abi),
                                    compressABI(contracts.rocketDAOProtocolProposal.abi),
                                    compressABI(contracts.rocketDAOProtocolVerifier.abi),
                                    compressABI(contracts.rocketDAOProtocolSettingsProposals.abi),
                                    compressABI(contracts.rocketDAOProtocolSettingsAuction.abi),
                                    compressABI(contracts.rocketMinipoolManager.abi),
                                    compressABI(contracts.rocketNodeStaking.abi),
                                    compressABI(contracts.rocketMinipoolDelegate.abi),
                                    compressABI(contracts.rocketNodeDeposit.abi),
                                    compressABI(contracts.rocketNetworkVoting.abi),
                                ],
                            ];
                            await instance.set(...args);
                            rocketUpgradeOneDotThreeDotOne = instance;
                            break;

                        // All other contracts - pass storage address
                        default:
                            instance = await contracts[contract].new(rocketStorageInstance.address);
                            addresses[contract] = instance.address;
                            break;
                    }
                }
            }
        });

        it(printTitle('upgrade', 'updates addresses correctly'), async () => {
            await rocketUpgradeOneDotThreeDotOne.lock();
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketUpgradeOneDotThreeDotOne', contracts.rocketUpgradeOneDotThreeDotOne.abi, rocketUpgradeOneDotThreeDotOne.address, { from: owner });
            await rocketUpgradeOneDotThreeDotOne.execute();

            const rocketStorage = await RocketStorage.deployed();

            for (let contract in addresses) {
                const key = hre.web3.utils.soliditySha3('contract.address', contract);
                const address = await rocketStorage.getAddress(key);

                assert.equal(address, addresses[contract]);
            }

            const versionString = await rocketStorage.getString(hre.web3.utils.soliditySha3('protocol.version'));
            assert.equal(versionString, '1.3.1');
        });

        it(printTitle('upgrade', 'adjusts quorum parameter correctly'), async () => {
            await rocketUpgradeOneDotThreeDotOne.lock();
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketUpgradeOneDotThreeDotOne', contracts.rocketUpgradeOneDotThreeDotOne.abi, rocketUpgradeOneDotThreeDotOne.address, { from: owner });
            await rocketUpgradeOneDotThreeDotOne.execute();

            const rocketDAOProtocolSettingsProposal = await RocketDAOProtocolSettingsProposals.deployed();
            const proposalQuorum = await rocketDAOProtocolSettingsProposal.getProposalQuorum.call();

            assertBN.equal(proposalQuorum, '0.30'.ether);
        });

        it(printTitle('upgrade', 'applies eth matched corrections'), async () => {
            // Get contracts
            const rocketNodeStaking = await RocketNodeStaking.deployed();

            // Register nodes
            const nodes = [node1, node2, node3, node4];
            const correctionAmounts = ['-8'.ether, '-4'.ether, '2'.ether, '-32'.ether];

            let ethMatchedBefores = [];

            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();

            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                // Register node
                await registerNode({ from: node });

                // Deposit and create minipools
                let count = hre.web3.utils.toBN(i + 1);
                let rplStake = minipoolRplStake.mul(count);
                await mintRPL(owner, node, rplStake);
                await nodeStakeRPL(rplStake, { from: node });

                await userDeposit({ from: random, value: '16'.ether.mul(count) });
                for (let j = 0; j < count; j++) {
                    await createMinipool({ from: node, value: '16'.ether });
                }

                // Confirm prior eth matched
                const ethMatchedBefore = await rocketNodeStaking.getNodeETHMatched(node);
                assertBN.equal(ethMatchedBefore, '16'.ether.mul(count));

                ethMatchedBefores[i] = ethMatchedBefore;

                // Add a correction
                await rocketUpgradeOneDotThreeDotOne.addCorrection(node, correctionAmounts[i]);

                // Check correction
                const correction = await rocketUpgradeOneDotThreeDotOne.corrections(i);
                assertBN.equal(correction[1], correctionAmounts[i]);
                assert.equal(correction[0], node);
            }

            // Execute upgrade
            await rocketUpgradeOneDotThreeDotOne.lock();
            await setDaoNodeTrustedBootstrapUpgrade('addContract', 'rocketUpgradeOneDotThreeDotOne', contracts.rocketUpgradeOneDotThreeDotOne.abi, rocketUpgradeOneDotThreeDotOne.address, { from: owner });
            await rocketUpgradeOneDotThreeDotOne.execute();

            // Confirm changes
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];

                const ethMatchedAfter = await rocketNodeStaking.getNodeETHMatched(node);
                assertBN.equal(ethMatchedAfter, ethMatchedBefores[i].add(correctionAmounts[i]));
            }
        });
    });
}
