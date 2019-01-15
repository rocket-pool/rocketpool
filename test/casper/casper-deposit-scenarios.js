import { CasperInstance } from '../_lib/utils/casper';


// Make a validator registration deposit into Casper
export async function scenarioValidatorDeposit({depositInput, fromAddress, value, gas}) {

    // Verify the deposit input is a correct SSZ
    // TODO: verify

    // Get Casper validator registration contract
    const casper = await CasperInstance();

    // Deposit
    let result = await casper.methods.deposit(depositInput).send({
        from: fromAddress,
        value: value,
        gas: gas,
    });

}
