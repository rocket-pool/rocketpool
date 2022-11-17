import { printTitle } from '../_utils/formatting';
import { getNodeFeeByDemand } from '../_helpers/network';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { upgradeOneDotTwo } from '../_utils/upgrade';
import { assertBN } from '../_helpers/bn';

export default function() {
    contract('RocketNetworkFees', async (accounts) => {


        // Accounts
        const [
            owner,
        ] = accounts;


        // Setup
        let minNodeFee = '0.00'.ether;
        let targetNodeFee = '0.50'.ether;
        let maxNodeFee = '1.00'.ether;
        let demandRange = '1'.ether;

        before(async () => {
            await upgradeOneDotTwo(owner);

            // Set network settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', minNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', targetNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', maxNodeFee, {from: owner});
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.demand.range', demandRange, {from: owner});
        });


        it(printTitle('network node fee', 'has correct value based on node demand'), async () => {
            // Set expected fees for node demand values
            let values = [
                {demand: '-1.25'.ether, expectedFee: '0'.ether},
                {demand: '-1.00'.ether, expectedFee: '0'.ether},
                {demand: '-0.75'.ether, expectedFee: '0.2890625'.ether},
                {demand: '-0.50'.ether, expectedFee: '0.4375'.ether},
                {demand: '-0.25'.ether, expectedFee: '0.4921875'.ether},
                {demand:  '0.00'.ether, expectedFee: '0.5'.ether},
                {demand:  '0.25'.ether, expectedFee: '0.5078125'.ether},
                {demand:  '0.50'.ether, expectedFee: '0.5625'.ether},
                {demand:  '0.75'.ether, expectedFee: '0.7109375'.ether},
                {demand:  '1.00'.ether, expectedFee: '1'.ether},
                {demand:  '1.25'.ether, expectedFee: '1'.ether},
            ];

            // Check fees
            for (let vi = 0; vi < values.length; ++vi) {
                let v = values[vi];
                let nodeFee = await getNodeFeeByDemand(v.demand);
                assertBN.equal(nodeFee, v.expectedFee, 'Node fee does not match expected fee for node demand value');
            }
        });
    });
}
