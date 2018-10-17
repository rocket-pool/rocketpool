import { printTitle, assertThrows } from '../_lib/utils/general';
import { scenarioWriteBool } from './rocket-storage-scenarios';

export default function() {

    contract('RocketStorage', async (accounts) => {


        // Owners direct access to storage is removed after initialisation when deployed
        it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
            await assertThrows(scenarioWriteBool({
                key: web3.utils.soliditySha3('test.access'),
                value: true,
                fromAddress: accounts[0],
                gas: 250000,
            }));
        });


    });

};
