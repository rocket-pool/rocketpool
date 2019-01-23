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

    // Get deposit data
    let depositData = Buffer.from(result.events.Deposit.returnValues.data.substr(2), 'hex');

    // Decode deposit amount
    let depositAmountGweiEncoded = depositData.slice(0, 8);
    let depositAmountWei = parseInt(depositAmountGweiEncoded.toString('hex'), 16) * 1000000000;

    // Check deposit amount
    assert.equal(depositAmountWei, parseInt(value), 'Deposit amount does not match');

}
