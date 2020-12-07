import { takeSnapshot, revertSnapshot } from '../_utils/evm';
import { printTitle } from '../_utils/formatting';
import { shouldRevert } from '../_utils/testing';
import { registerNode } from '../_helpers/node';
import { register } from './scenario-register';
import { setTrustedDaoBootstrapMember } from './scenario-trusted-dao-bootstrap';

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
            registeredNode3,
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
            await registerNode({from: registeredNode3});
            await registerNode({from: registeredNodeTrusted1});
            await registerNode({from: registeredNodeTrusted2});
            await registerNode({from: registeredNodeTrusted3});
            // Enable last node to be trusted
            await setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'Node Number 1', registeredNodeTrusted1, {from: owner});
            await setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'Node Number 2', registeredNodeTrusted2, {from: owner});
            // await setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'Node Number 3', registeredNodeTrusted3, {from: owner});

        });


        //
        // Start Tests
        //

        it(printTitle('userOne', 'fails to be added as a trusted node dao member as they are not a registered node'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'User Node', userOne, {
                from: owner
            }), 'Non registered node added to trusted node DAO', 'Invalid node');
        });

        it(printTitle('userOne', 'fails to add a bootstrap trusted node DAO member as non owner'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'User Node', registeredNode1, {
                from: userOne
            }), 'Non owner registered node to trusted node DAO', 'Account is not Rocket Pool or the DAO');
        });

        it(printTitle('owner', 'cannot add the same member twice'), async () => {
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'Node Number 2', registeredNodeTrusted2, {
                from: owner
            }), 'Owner the same DAO member twice', 'This node is already part of the trusted node DAO');
        });

  
        it(printTitle('owner', 'fails to add more than the 3 min required bootstrap trusted node dao members'), async () => {
            // Add our 3rd member
            await setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'Node Number 3', registeredNodeTrusted3, {from: owner});
            // Set as trusted dao member via bootstrapping
            await shouldRevert(setTrustedDaoBootstrapMember('rocketpool', 'node@home.com', 'User Node', registeredNode3, {
                from: owner
            }), 'Owner added more than 3 bootstrap trusted node dao members', 'Bootstrap mode not engaged, min DAO member count has been met');
        });
        
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
