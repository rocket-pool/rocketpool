import { printTitle, assertThrows } from '../_lib/utils/general';
import { getWithdrawalPubkey, getWithdrawalCredentials } from '../_lib/utils/beacon';
import { RocketAdmin } from '../_lib/artifacts';
import { createNodeContract } from '../_helpers/rocket-node';
import { scenarioUpdateWithdrawalKey } from './rocket-node-watchtower-scenarios';

export default function() {

    contract('RocketNodeWatchtower - Withdrawal Keys', async (accounts) => {


        // Accounts
        const owner = accounts[0];
        const untrustedNodeOperator = accounts[1];
        const trustedNodeOperator1 = accounts[2];
        const trustedNodeOperator2 = accounts[3];
        const trustedNodeOperator3 = accounts[4];


        // Setup
        before(async () => {

            // Create node contracts
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: untrustedNodeOperator});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: trustedNodeOperator1});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: trustedNodeOperator2});
            await createNodeContract({timezone: 'Australia/Brisbane', nodeOperator: trustedNodeOperator3});

            // Set node contract status
            let rocketAdmin = await RocketAdmin.deployed();
            await rocketAdmin.setNodeTrusted(trustedNodeOperator1, true, {from: owner, gas: 500000});
            await rocketAdmin.setNodeTrusted(trustedNodeOperator2, true, {from: owner, gas: 500000});
            await rocketAdmin.setNodeTrusted(trustedNodeOperator3, true, {from: owner, gas: 500000});

        });


        // Trusted node can vote to update the withdrawal key
        it(printTitle('trusted node', 'can vote to update the withdrawal key'), async () => {
            await scenarioUpdateWithdrawalKey({
                withdrawalKey: getWithdrawalPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                fromAddress: trustedNodeOperator1,
                gas: 500000,
            });
        });


        // Trusted node cannot vote to update the withdrawal key repeatedly
        it(printTitle('trusted node', 'cannot vote to update the withdrawal key repeatedly'), async () => {
            await assertThrows(scenarioUpdateWithdrawalKey({
                withdrawalKey: getWithdrawalPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                fromAddress: trustedNodeOperator1,
                gas: 500000,
            }), 'Node voted to update the withdrawal key repeatedly');
        });


        // Trusted node cannot vote to update the withdrawal key with an invalid key
        it(printTitle('trusted node', 'cannot vote to update the withdrawal key with an invalid key'), async () => {
            await assertThrows(scenarioUpdateWithdrawalKey({
                withdrawalKey: Buffer.from('01234567', 'hex'),
                withdrawalCredentials: getWithdrawalCredentials(),
                fromAddress: trustedNodeOperator1,
                gas: 500000,
            }), 'Node voted to update the withdrawal key with an invalid key');
        });


        // Trusted node can complete the withdrawal key update
        it(printTitle('trusted node', 'can complete the withdrawal key update'), async () => {
            await scenarioUpdateWithdrawalKey({
                withdrawalKey: getWithdrawalPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                fromAddress: trustedNodeOperator2,
                gas: 500000,
                expectUpdate: true,
            });
        });


        // Untrusted node cannot vote to update the withdrawal key
        it(printTitle('untrusted node', 'cannot vote to update the withdrawal key'), async () => {
            await assertThrows(scenarioUpdateWithdrawalKey({
                withdrawalKey: getWithdrawalPubkey(),
                withdrawalCredentials: getWithdrawalCredentials(),
                fromAddress: untrustedNodeOperator,
                gas: 500000,
            }), 'Untrusted node voted to update the withdrawal key');
        });


    });

}
