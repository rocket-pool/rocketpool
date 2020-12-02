import { RocketNodeTrustedDAO } from '../_utils/artifacts';


// The trusted node DAO can be bootstrapped with several nodes
export async function setTrustedDaoMember(_id, _email, _message = '', _nodeAddress, txOptions) {

    // Load contracts
    const rocketNodeTrustedDAO = await RocketNodeTrustedDAO.deployed();

    // Get data about the tx
    function getTxData() {
        return Promise.all([
            rocketNodeTrustedDAO.getMemberCount.call(),
            rocketNodeTrustedDAO.getMemberIsValid.call(_nodeAddress),
        ]).then(
            ([memberCount, memberIsValid]) =>
            ({memberCount, memberIsValid})
        );
    }

    // Capture data
    let ds1 = await getTxData();

    //console.log(Number(ds1.memberCount), ds1.memberIsValid);

    // Set as a bootstrapped member
    await rocketNodeTrustedDAO.add(_id, _email, _message, _nodeAddress, txOptions);

    // Capture data
    let ds2 = await getTxData();

    //console.log(Number(ds2.memberCount), ds2.memberIsValid);

    let lastMemberAddress = await rocketNodeTrustedDAO.getMemberAt.call(ds2.memberCount.sub(web3.utils.toBN(1)));

    // Check trusted node index
    assert(ds2.memberCount.eq(ds1.memberCount.add(web3.utils.toBN(1))), 'Incorrect updated trusted node count');
    assert.equal(lastMemberAddress, _nodeAddress, 'Incorrect updated trusted node index');

}

