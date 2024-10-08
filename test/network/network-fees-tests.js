import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { getNodeFeeByDemand } from '../_helpers/network';
import { RocketDAOProtocolSettingsNetwork } from '../_utils/artifacts';
import { setDAOProtocolBootstrapSetting } from '../dao/scenario-dao-protocol-bootstrap';
import { assertBN } from '../_helpers/bn';
import { globalSnapShot } from '../_utils/snapshotting';

const helpers = require('@nomicfoundation/hardhat-network-helpers');
const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('RocketNetworkFees', () => {
        let owner;

        // Constants
        const minNodeFee = '0.10'.ether;
        const targetNodeFee = '0.15'.ether;
        const maxNodeFee = '0.20'.ether;
        const demandRange = '1'.ether;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
            ] = await ethers.getSigners();

            // Set network settings
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.minimum', minNodeFee, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.target', targetNodeFee, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.maximum', maxNodeFee, { from: owner });
            await setDAOProtocolBootstrapSetting(RocketDAOProtocolSettingsNetwork, 'network.node.fee.demand.range', demandRange, { from: owner });
        });

        it(printTitle('network node fee', 'has correct value based on node demand'), async () => {
            // Set expected fees for node demand values
            let values = [
                { demand: '-1.25'.ether, expectedFee: '0.1'.ether },
                { demand: '-1.00'.ether, expectedFee: '0.1'.ether },
                { demand: '-0.75'.ether, expectedFee: '0.12890625'.ether },
                { demand: '-0.50'.ether, expectedFee: '0.14375'.ether },
                { demand: '-0.25'.ether, expectedFee: '0.14921875'.ether },
                { demand: '0.00'.ether, expectedFee: '0.15'.ether },
                { demand: '0.25'.ether, expectedFee: '0.15078125'.ether },
                { demand: '0.50'.ether, expectedFee: '0.15625'.ether },
                { demand: '0.75'.ether, expectedFee: '0.17109375'.ether },
                { demand: '1.00'.ether, expectedFee: '0.2'.ether },
                { demand: '1.25'.ether, expectedFee: '0.2'.ether },
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
