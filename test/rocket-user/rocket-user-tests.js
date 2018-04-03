import { printTitle } from '../utils';
import { scenarioRegisterWithdrawalAddress } from './rocket-user-scenarios';

export default function({
    owner,
    accounts,
    userSecondBackupAddress,
    miniPools
}) {

    describe('RocketUser', async () => {


        // Second user sets a backup withdrawal address
        it(printTitle('userSecond', 'registers a backup withdrawal address on their deposit while minipool is in countdown'), async () => {
            await scenarioRegisterWithdrawalAddress({
                withdrawalAddress: userSecondBackupAddress,
                miniPoolAddress: miniPools.first.address,
                fromAddress: accounts[2],
                gas: 550000,
            });
        });


    });

}
