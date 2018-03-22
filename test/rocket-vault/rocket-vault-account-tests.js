import { printTitle, assertThrows } from '../utils';
import { RocketVault, RocketSettings } from '../artifacts';
import { scenarioAddAccount } from './rocket-vault-scenarios';

export default function({owner, accounts}) {

    describe('RocketVault - Accounts', async () => {


        // Contract dependencies
        let rocketVault;
        let rocketSettings;
        before(async () => {
            rocketVault = await RocketVault.deployed();
            rocketSettings = await RocketSettings.deployed();
        });


    });

};
