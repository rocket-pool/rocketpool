import { printTitle, assertThrows } from '../_lib/utils/general';
import { RocketGroupAPI, RocketGroupContract, RocketGroupSettings } from '../_lib/artifacts';
import { scenarioSetFeePerc } from './rocket-group-contract-scenarios';

export default function() {

    contract('RocketGroupContract', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const groupOwner = accounts[1];


        // Setup
        let groupContract;
        before(async () => {

            // Get new group fee
            let rocketGroupSettings = await RocketGroupSettings.deployed();
            let newGroupFee = parseInt(await rocketGroupSettings.getNewFee());

            // Create group
            let rocketGroupAPI = await RocketGroupAPI.deployed();
            let result = await rocketGroupAPI.add('Group 1', web3.utils.toWei('0', 'ether'), {from: groupOwner, gas: 7500000, value: newGroupFee});

            // Get group contract
            let groupContractAddress = result.logs.filter(log => (log.event == 'GroupAdd'))[0].args.ID;
            groupContract = await RocketGroupContract.at(groupContractAddress);

        });


        // Group owner can set the group's fee percentage
        it(printTitle('group owner', 'can set the group\'s fee percentage'), async () => {
            await scenarioSetFeePerc({
                groupContract,
                stakingFee: web3.utils.toWei('0.5', 'ether'),
                fromAddress: groupOwner,
                gas: 500000,
            });
        });


        // Group owner cannot set an invalid fee percentage
        it(printTitle('group owner', 'cannot set an invalid fee percentage'), async () => {
            await assertThrows(scenarioSetFeePerc({
                groupContract,
                stakingFee: web3.utils.toWei('1.05', 'ether'),
                fromAddress: groupOwner,
                gas: 500000,
            }), 'Set an invalid fee percentage');
        });


    });

};
