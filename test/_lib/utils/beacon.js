// Artifacts
const ValidatorRegistration = artifacts.require('./ValidatorRegistration');


// Validator statuses
export const ValidatorStatus = {
    PENDING_ACTIVATION: 0,
    ACTIVE: 1,
    PENDING_EXIT: 2,
    PENDING_WITHDRAW: 3,
    WITHDRAWN: 4,
    PENALIZED: 127,
};


/**
 * Dummy beacon chain implementation
 * Simulates beacon chain activity by tracking validators
 */
export class DummyBeaconChain {


    // Constructor
    constructor(web3) {

        // Web3 instance
        this.web3 = web3;

        // Validator set
        this.validators = [];

    }


    // Initialise
    async init() {

        // Get network ID
        let networkId = await this.web3.eth.net.getId();

        // Initialise validator registration contract
        let validatorRegistration = new this.web3.eth.Contract(ValidatorRegistration.abi, ValidatorRegistration.networks[networkId].address);

        // Subscribe to validator registered events
        validatorRegistration.events.ValidatorRegistered({fromBlock: 0}).on('data', (event) => {

            // Add validator to active set
            let validatorIndex = this.addValidator(event.returnValues.pubKey, event.returnValues.withdrawalAddressbytes32);
            this.setValidatorStatus(validatorIndex, ValidatorStatus.ACTIVE);

        });

    }


    // Add validator to set and return index
    addValidator(pubKey, withdrawalAddress) {
        return this.validators.push({
            pubKey,
            withdrawalAddress,
            status: ValidatorStatus.PENDING_ACTIVATION,
        }) - 1;
    }


    // Remove validator at index from set
    removeValidator(index) {
        this.validators.splice(index, 1);
    }


    // Set validator status at index
    setValidatorStatus(index, status) {
        this.validators[index].status = status;
    }


    // Get all validators
    getValidators() {
        return this.validators.slice();
    }


    // Get validators by status
    getValidatorsByStatus(status) {
        return this.validators.filter(validator => (validator.status == status));
    }


    // Get validator index by pubKey
    getValidatorIndexByPubKey(pubKey) {
        return this.validators.findIndex(validator => (validator.pubKey == pubKey));
    }


    // Get validator index by withdrawal address
    getValidatorIndexByWithdrawalAddress(withdrawalAddress) {
        return this.validators.findIndex(validator => (validator.withdrawalAddress.toLowerCase() == withdrawalAddress.toLowerCase()));
    }


}

