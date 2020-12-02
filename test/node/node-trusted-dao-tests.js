import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { register } from './scenario-register';
import { setTrustedDaoMember } from './scenario-trusted-dao-add';

// Contracts
import { RocketNodeTrustedDAO } from '../_utils/artifacts';

export default function() {
    contract.only('RocketNodeTrustedDAO', async (accounts) => {


        // Accounts
        const [
            owner,
            userOne,
            userTwo,
            registeredNode1,
            registeredNode2,
            registeredNodeTrusted1,
            registeredNodeTrusted2,
            registeredNodeTrusted3,
        ] = accounts;


        // State snapshotting
        let snapshotId;
        beforeEach(async () => { snapshotId = await takeSnapshot(web3); });
        afterEach(async () => { await revertSnapshot(web3, snapshotId); });


        // Setup
        before(async () => {

            // Register nodes
            await registerNode({from: registeredNode1});
            await registerNode({from: registeredNode2});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});
            // Enable last node to be trusted
            await setTrustedDaoMember('node1', 'node@home.com', '', registeredNodeTrusted1, {from: owner});
            //await setNodeTrusted(registeredNodeTrusted2, true, {from: owner});
            //await setNodeTrusted(registeredNodeTrusted3, true, {from: owner});

        });


        //
        // Start Tests
        //

        
        it(printTitle('registeredNode1', 'verify trusted node quorum votes required is correct'), async () => {
            // Load contracts
            const rocketNodeTrustedDAO = await RocketNodeTrustedDAO.deployed();
            // How many trusted nodes do we have?
            let trustedNodeCount =  await rocketNodeTrustedDAO.getMemberCount({
                from: registeredNode1,
            });
            // Get the current quorum threshold
            let quorumThreshold = await rocketNodeTrustedDAO.getSettingQuorumThreshold({
                from: registeredNode1,
            });
            // Calculate the expected vote threshold
            let expectedVotes = (Number(web3.utils.fromWei(quorumThreshold)) * Number(trustedNodeCount)).toFixed(2);
            // Calculate it now on the contracts
            let quorumVotes = await rocketNodeTrustedDAO.getProposalQuorumVotesRequired({
                from: registeredNode1,
            });
            // Verify
            assert(expectedVotes == Number(web3.utils.fromWei(quorumVotes)).toFixed(2), "Expected vote threshold does not match contracts");         
        });


    });
}
