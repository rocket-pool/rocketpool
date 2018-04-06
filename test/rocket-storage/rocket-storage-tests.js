import { printTitle, assertThrows } from '../utils';
import { RocketStorage } from '../artifacts';

export default function({owner, accounts}) {

    contract('RocketStorage', async () => {


        // Contract dependencies
        let rocketStorage;
        before(async () => {
            rocketStorage = await RocketStorage.deployed();
        });


        // Owners direct access to storage is removed after initialisation when deployed
        it(printTitle('owner', 'fail to access storage directly after deployment'), async () => {
            await assertThrows(rocketStorage.setBool(web3.sha3('test.access'), true, {from: owner, gas: 250000}));
        });


    });

};
