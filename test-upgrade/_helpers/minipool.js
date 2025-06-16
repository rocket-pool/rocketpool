import {
    RocketMinipoolDelegate,
    RocketMinipoolFactory,
    RocketNodeDeposit,
    RocketNodeStaking,
} from '../../test/_utils/artifacts';
const types = require('@chainsafe/lodestar-types/lib/ssz/presets/mainnet').types;

let minipoolSalt = 1;
let pubkeyIndex = 0;

export async function createMinipool(txOptions, salt = null) {
    return createMinipoolWithBondAmount(txOptions.value, txOptions, salt);
}

export async function createMinipoolWithBondAmount(bondAmount, txOptions, salt = null) {
    // Load contracts
    const [
        rocketMinipoolFactory,
        rocketNodeDeposit,
    ] = await Promise.all([
        RocketMinipoolFactory.deployed(),
        RocketNodeDeposit.deployed(),
        RocketNodeStaking.deployed(),
    ]);

    if (salt === null) {
        salt = minipoolSalt++;
    }

    let minipoolAddress = (await rocketMinipoolFactory.getExpectedAddress(txOptions.from, salt)).substr(2);

    let withdrawalCredentials = '0x010000000000000000000000' + minipoolAddress;

    // Get validator deposit data
    let depositData = {
        pubkey: getValidatorPubkey(),
        withdrawalCredentials: Buffer.from(withdrawalCredentials.substr(2), 'hex'),
        amount: BigInt(1000000000), // gwei
        signature: getValidatorSignature(),
    };

    let depositDataRoot = getDepositDataRoot(depositData);

    if (txOptions.value === bondAmount) {
        await rocketNodeDeposit.connect(txOptions.from).deposit(bondAmount, '0'.ether, depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
    } else {
        await rocketNodeDeposit.connect(txOptions.from).depositWithCredit(bondAmount, '0'.ether, depositData.pubkey, depositData.signature, depositDataRoot, salt, '0x' + minipoolAddress, txOptions);
    }

    return RocketMinipoolDelegate.at('0x' + minipoolAddress);
}

// Create a new validator pubkey
export function getValidatorPubkey() {
    let index = ++pubkeyIndex;
    return Buffer.from(index.toString(16).padStart(96, '0'), 'hex');
}

// Create a validator signature
export function getValidatorSignature() {
    return Buffer.from(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' +
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'hex');
}

// Create validator deposit data root
export function getDepositDataRoot(depositData) {
    return types.DepositData.hashTreeRoot(depositData);
}
