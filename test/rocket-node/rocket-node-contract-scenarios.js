// Reserve a deposit
export async function scenarioDepositReserve({nodeContract, amount, durationID, fromAddress, gas}) {

    // Reserve deposit
    await nodeContract.depositReserve(amount, durationID, {from: fromAddress, gas: gas});

    // Get deposit information
    let reservationExists = await nodeContract.getHasDepositReservation.call();
    let reservationAmount = parseInt(await nodeContract.getDepositReserveEtherRequired.call());
    let reservationDurationID = await nodeContract.getDepositReserveDurationID.call();

    // Asserts
    assert.isTrue(reservationExists, 'Reservation was not created successfully');
    assert.equal(reservationAmount, amount, 'Reservation amount is incorrect');
    assert.equal(reservationDurationID, durationID, 'Reservation duration ID is incorrect');

}
