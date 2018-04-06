import { printTitle } from '../utils';
import { scenarioIncrementEpoch, scenarioIncrementDynasty } from './casper-scenarios';

export default function({owner, accounts}) {

    describe('Casper', async () => {


        // Simulate Caspers epoch and dynasty changing
        it(printTitle('casper', 'simulate Caspers epoch and dynasty changing'), async () => {
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementEpoch(owner);
            await scenarioIncrementDynasty(owner);
        });


    });

}
