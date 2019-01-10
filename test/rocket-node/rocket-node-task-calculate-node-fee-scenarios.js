// Checkin node
export async function scenarioCheckin({nodeContract, feeVote, fromAddress, gas}) {

    // Checkin
    await nodeContract.checkin(0, feeVote, {from: fromAddress, gas: gas});

}
