import { printTitle } from '../_utils/formatting';
import { getNodeFeeByDemand } from '../_helpers/network';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';

export default function() {
    contract('RocketNetworkFees', async (accounts) => {


        // Accounts
        const [
            owner,
            node,
            trustedNode1,
            trustedNode2,
            trustedNode3,
        ] = accounts;


        // Setup
        let minNodeFee = web3.utils.toWei('0.00', 'ether');
        let targetNodeFee = web3.utils.toWei('0.50', 'ether');
        let maxNodeFee = web3.utils.toWei('1.00', 'ether');
        let demandRange = web3.utils.toWei('1', 'ether');
        before(async () => {

            // Set network settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', minNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', targetNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', maxNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.demand.range', demandRange, {from: owner});

        });


        it(printTitle('network node fee', 'has correct value based on node demand'), async () => {

            // Set expected fees for node demand values
            let values = [
                {demand: web3.utils.toWei('-1.25', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0', 'ether'))},
                {demand: web3.utils.toWei('-1.00', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0', 'ether'))},
                {demand: web3.utils.toWei('-0.75', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.2890625', 'ether'))},
                {demand: web3.utils.toWei('-0.50', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.4375', 'ether'))},
                {demand: web3.utils.toWei('-0.25', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.4921875', 'ether'))},
                {demand: web3.utils.toWei( '0.00', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.5', 'ether'))},
                {demand: web3.utils.toWei( '0.25', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.5078125', 'ether'))},
                {demand: web3.utils.toWei( '0.50', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.5625', 'ether'))},
                {demand: web3.utils.toWei( '0.75', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('0.7109375', 'ether'))},
                {demand: web3.utils.toWei( '1.00', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('1', 'ether'))},
                {demand: web3.utils.toWei( '1.25', 'ether'), expectedFee: web3.utils.toBN(web3.utils.toWei('1', 'ether'))},
            ];

            // Check fees
            for (let vi = 0; vi < values.length; ++vi) {
                let v = values[vi];
                let nodeFee = await getNodeFeeByDemand(v.demand);
                assert(nodeFee.eq(v.expectedFee), 'Node fee does not match expected fee for node demand value');
            }

        });


    });
}
