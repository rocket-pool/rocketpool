import { printTitle } from '../utils';
import { scenarioIncrementEpochAndDynasty } from './casper-scenarios';

export default function({owner, accounts}) {

	describe('Casper', async () => {


		// Simulate Caspers epoch and dynasty changing
        it(printTitle('casper', 'simulate Caspers epoch and dynasty changing'), async () => {
            await scenarioIncrementEpochAndDynasty({increment: ['e','e','d'], fromAddress: owner});
        });


	});

}
