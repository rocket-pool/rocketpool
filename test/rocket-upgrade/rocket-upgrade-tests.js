import { printTitle, assertThrows } from '../utils';
import { RocketUpgrade } from '../artifacts';

export default function({owner, accounts}) {

    describe('RocketUpgrade', async () => {
        let rocketUpgrade;

        before(async () => {
            rocketUpgrade = await RocketUpgrade.deployed();
        });

        

    });

};
