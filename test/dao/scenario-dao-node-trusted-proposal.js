import { RocketDAONodeTrusted, RocketDAOProposal } from '../_utils/artifacts';


// Create a proposal for this DAO
export async function daoNodeTrustedProposal(_proposalMessage, _payload, txOptions) {

    // Load contracts
    const rocketDAOProposal = await RocketDAOProposal.deployed();
    const rocketDAONodeTrusted = await RocketDAONodeTrusted.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketDAOProposal.getTotal.call(),
        ]).then(
            ([proposalTotal]) =>
            ({proposalTotal})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    // console.log(Number(ds1.proposalTotal));

    // Add a new proposal
    await rocketDAONodeTrusted.propose(_proposalMessage, _payload, txOptions);

    // Capture data
    let ds2 = await getTxData();

    // console.log(Number(ds2.proposalTotal));

    // Check trusted node index
    assert(ds2.proposalTotal.eq(ds1.proposalTotal.add(web3.utils.toBN(1))), 'Incorrect proposal total count');
    // assert.equal(lastMemberAddress, _nodeAddress, 'Incorrect updated trusted node index');

}


