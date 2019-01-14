import { printTitle, assertThrows } from '../_lib/utils/general';
import { CasperInstance } from '../_lib/utils/casper';


// An address makes a deposit into Casper
export async function scenarioValidatorDeposit(depositInput) {

    // Verify the deposit input is a correct SSZ 
    
    /*
    // Make sure epoch is set correctly
    await casperEpochInitialise(fromAddress)

    // Casper
    const casper = await CasperInstance();
    let tx = await casper.methods.deposit(validationAddr, withdrawalAddr).send({
        from: fromAddress, 
        gas: 3750000, 
        gasPrice: '20000000000',
        value: amountInWei
    });
    assert.equal(tx.events.Deposit.returnValues._from.toLowerCase(), withdrawalAddr.toLowerCase(), 'Casper deposit failed and has incorrect fromAddress');
    */
}



