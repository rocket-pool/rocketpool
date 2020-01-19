import { CasperInstance } from '../_lib/utils/casper';


// Make a validator registration deposit into Casper
export async function scenarioValidatorDeposit({pubkey, withdrawalCredentials, signature, depositDataRoot, fromAddress, value, gas}) {

    // Get Casper validator registration contract
    const casper = await CasperInstance();

    // Deposit
    await casper.methods.deposit(pubkey, withdrawalCredentials, signature, depositDataRoot).send({
        from: fromAddress,
        value: value,
        gas: gas,
    });

}
