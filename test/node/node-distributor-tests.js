import { printTitle } from '../_utils/formatting';
import {
    RocketNodeManager,
    RocketDAONodeTrustedSettingsMinipool,
    RocketNodeDistributorFactory
} from '../_utils/artifacts';
import {
    createMinipool,
    getMinipoolMinimumRPLStake,
    stakeMinipool,
} from '../_helpers/minipool';
import { registerNode, setNodeTrusted, nodeStakeRPL } from '../_helpers/node';
import { mintRPL } from '../_helpers/tokens';
import { distributeRewards } from './scenario-distribute-rewards';
import { increaseTime } from '../_utils/evm';
import { setDAONodeTrustedBootstrapSetting } from '../dao/scenario-dao-node-trusted-bootstrap';
import { shouldRevert } from '../_utils/testing';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { userDeposit } from '../_helpers/deposit';

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

        before(async () => {
            await upgradeOneDotTwo(owner);

            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Set settings
            await setDAONodeTrustedBootstrapSetting(RocketDAONodeTrustedSettingsMinipool, 'minipool.scrub.period', scrubPeriod, {from: owner});
            // Register node
            await registerNode({from: node1});
            distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(node1);
            // Register trusted node
            await registerNode({from: trustedNode});
            await setNodeTrusted(trustedNode, 'saas_1', 'node@home.com', owner);
            // Stake RPL to cover minipools
            let minipoolRplStake = await getMinipoolMinimumRPLStake();
            rplStake = minipoolRplStake.mul('7'.BN);
            await mintRPL(owner, node1, rplStake);
            await nodeStakeRPL(rplStake, {from: node1}, true);
            await mintRPL(owner, node2, rplStake);
        });


        it(printTitle('node operator', 'can not initialise fee distributor if registered after upgrade'), async () => {
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            // Get contracts
            const rocketNodeManager = await RocketNodeManager.deployed();
            // Attempt to initialise
            await shouldRevert(rocketNodeManager.initialiseFeeDistributor({from: node2}), 'Was able to initialise again', 'Already initialised');
        });


        it(printTitle('node operator', 'can not initialise fee distributor if already initialised'), async () => {
            // Attempt to initialise a second time
            const rocketNodeManager = await RocketNodeManager.deployed();
            await shouldRevert(rocketNodeManager.initialiseFeeDistributor({from: node1}), 'Was able to initialise again', 'Already initialised');
        });


        it(printTitle('node operator', 'can distribute rewards with no minipools'), async () => {
            // Send ETH and distribute
            await web3.eth.sendTransaction({to: distributorAddress, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node1, null)
        });


        it(printTitle('node operator', 'can distribute rewards with 1 minipool'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({from: random, value: '16'.ether})
            let stakingMinipool = await createMinipool({from: node2, value: '16'.ether});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool, {from: node2});
            // Distribute
            await web3.eth.sendTransaction({to: distributorAddress2, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });


        it(printTitle('node operator', 'can distribute rewards with multiple minipools'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({from: random, value: '32'.ether})
            let stakingMinipool1 = await createMinipool({from: node2, value: '16'.ether});
            let stakingMinipool2 = await createMinipool({from: node2, value: '16'.ether});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, {from: node2});
            await stakeMinipool(stakingMinipool2, {from: node2});

            await web3.eth.sendTransaction({to: distributorAddress2, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });


        it(printTitle('node operator', 'can distribute rewards after staking and withdrawing'), async () => {
            // Get contracts
            const rocketNodeDistributorFactory = await RocketNodeDistributorFactory.deployed();
            // Register node
            await registerNode({from: node2});
            await nodeStakeRPL(rplStake, {from: node2});
            const distributorAddress2 = await rocketNodeDistributorFactory.getProxyAddress(node2);
            // Create and stake a minipool
            await userDeposit({from: random, value: '32'.ether})
            let stakingMinipool1 = await createMinipool({from: node2, value: '16'.ether});
            let stakingMinipool2 = await createMinipool({from: node2, value: '16'.ether});
            await increaseTime(web3, scrubPeriod + 1);
            await stakeMinipool(stakingMinipool1, {from: node2});
            await stakeMinipool(stakingMinipool2, {from: node2});

            // Mark minipool as withdrawable to remove it from the average fee calculation
            // await submitMinipoolWithdrawable(stakingMinipool1.address, {from: trustedNode});

            await web3.eth.sendTransaction({to: distributorAddress2, from: owner, value: web3.utils.toWei("1", "ether")});
            await distributeRewards(node2, null)
        });
    });
}
