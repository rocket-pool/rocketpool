import { printTitle } from '../_utils/formatting';
import {
    RocketNodeManager,
    RocketDAONodeTrustedSettingsMinipool,
    RocketNodeDistributorFactory, RocketNodeManagerNew, RocketNodeManagerOld
} from '../_utils/artifacts';
import {
    createMinipool,
    getMinipoolMinimumRPLStake,
    stakeMinipool,
    submitMinipoolWithdrawable
} from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { distributeRewards } from './scenario-distribute-rewards';
import { increaseTime } from '../_utils/evm';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { shouldRevert } from '../_utils/testing';
import { upgradeDistributor } from '../_utils/upgrade';

export default function() {
    contract('RocketNodeDistributor', async (accounts) => {

        // Accounts
        const [
            owner,
            node1,
            node2,
            trustedNode,
            random,
        ] = accounts;


        // Setup
        let scrubPeriod = (60 * 60 * 24); // 24 hours
        let distributorAddress;
        let rplStake;

        // Registers a node using the old contract (pre-distributor upgrade)
        async function registerNodeOld(txOptions) {
            const rocketNodeManager = await RocketNodeManagerOld.deployed();
            await rocketNodeManager.registerNode('Australia/Brisbane', txOptions);
        }

        before(async () => {

            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});
            // Register node
            await registerNodeOld({from: node1});
            distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(node1);
            // Register trusted node
            await registerNodeOld({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            rplStake = minipoolRplStake.mul(web3.utils.toBN(7));
            await mintRPL(owner, node1, rplStake);
            await nodeStakeRPL(rplStake, {from: node1});
            await mintRPL(owner, node2, rplStake);
        });


        it(printTitle('node operator', 'can not initialise fee distributor if registered after upgrade'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            // Get contracts
            const rocketNodeManager = await RocketNodeManager.deployed();
            // Attempt to initialise
            await shouldRevert(rocketNodeManager.initialiseFeeDistributor({from: node2}), 'Was able to initialise again', 'Already initialised');
        });


        it(printTitle('node operator', 'can not initialise fee distributor if already initialised'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Attempt to initialise for first time
            const rocketNodeManager = await RocketNodeManager.deployed();
            await rocketNodeManager.initialiseFeeDistributor({from: node1});
            // Attempt to initialise a second time
            await shouldRevert(rocketNodeManager.initialiseFeeDistributor({from: node1}), 'Was able to initialise again', 'Already initialised');
        });


        it(printTitle('node operator', 'can not create minipool without an initialised fee distributor'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Create and stake a minipool
            await shouldRevert(createMinipool({from: node1, value: web3.utils.toWei('32', 'ether')}), 'Was able to create minipool without initialising fee distributor first', 'Fee distributor not initialised');
        });


        it(printTitle('node operator', 'can distribute rewards with no minipools'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Initialise fee distributor
            const rocketNodeManager = await RocketNodeManager.deployed();
            await rocketNodeManager.initialiseFeeDistributor({from: node1});
            // Send ETH and distribute
            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node1, null)
        });


        it(printTitle('node operator', 'can distribute rewards with 1 minipool'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            // Create and stake a minipool
            let stakingMinipool = await createMinipool({from: node2, value: web3.utils.toWei('32', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool, {from: node2});
            // Distribute
            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });


        it(printTitle('node operator', 'can distribute rewards with minipools existing prior to upgrade'), async () => {
            // Create and stake a minipool
            let stakingMinipool1 = await createMinipool({from: node1, value: web3.utils.toWei('32', 'ether')}, null, true);
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, {from: node1});
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Initialise distributor
            const rocketNodeManager = await RocketNodeManager.deployed();
            await rocketNodeManager.initialiseFeeDistributor({from: node1});
            // Create and stake another minipool
            let stakingMinipool2 = await createMinipool({from: node1, value: web3.utils.toWei('32', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool2, {from: node1});
            // Distribute
            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node1, null)
        });


        it(printTitle('node operator', 'can distribute rewards with multiple minipools'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            // Create and stake a minipool
            let stakingMinipool1 = await createMinipool({from: node2, value: web3.utils.toWei('32', 'ether')});
            let stakingMinipool2 = await createMinipool({from: node2, value: web3.utils.toWei('32', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, {from: node2});
            await stakeMinipool(stakingMinipool2, {from: node2});

            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });


        it(printTitle('node operator', 'can distribute rewards after staking and withdrawing'), async () => {
            // Upgrade distributor
            await upgradeDistributor(owner);
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            // Create and stake a minipool
            let stakingMinipool1 = await createMinipool({from: node2, value: web3.utils.toWei('32', 'ether')});
            let stakingMinipool2 = await createMinipool({from: node2, value: web3.utils.toWei('32', 'ether')});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, {from: node2});
            await stakeMinipool(stakingMinipool2, {from: node2});

            // Mark minipool as withdrawable to remove it from the average fee calculation
            await submitMinipoolWithdrawable(stakingMinipool1.address, {from: trustedNode});

            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });
    });
}
