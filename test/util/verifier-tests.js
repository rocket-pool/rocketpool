import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { artifacts, BeaconStateVerifier, BlockRootsMock } from '../_utils/artifacts';
import * as assert from 'assert';
import { shouldRevert } from '../_utils/testing';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { globalSnapShot } from '../_utils/snapshotting';

const hre = require('hardhat');
const ethers = hre.ethers;

function toLittleEndian(value) {
    let v = BigInt(value);
    const result = new Uint8Array(32);
    for (let i = 0; i < result.length; ++i) {
        result[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return ethers.hexlify(result);
}

function sha256Pair(left, right) {
    return ethers.sha256(ethers.concat([left, right]));
}

function makeWitnesses(length) {
    return Array.from({ length }, (_, i) => ethers.zeroPadValue(ethers.toBeHex(i + 1), 32));
}

function restoreRoot(leaf, path, witnesses) {
    let gindex = BigInt(`0b1${path}`);
    let value = leaf;
    for (const witness of witnesses) {
        value = gindex % 2n === 1n ? sha256Pair(witness, value) : sha256Pair(value, witness);
        gindex /= 2n;
    }
    assert.equal(gindex, 1n);
    return value;
}

function merkleiseValidator(validator) {
    const pubkey = ethers.getBytes(validator.pubkey);
    const pubkeyRoot = sha256Pair(
        ethers.hexlify(pubkey.slice(0, 32)),
        ethers.hexlify(new Uint8Array([...pubkey.slice(32), ...new Uint8Array(16)])),
    );
    const a = sha256Pair(pubkeyRoot, validator.withdrawalCredentials);
    const b = sha256Pair(toLittleEndian(validator.effectiveBalance), toLittleEndian(validator.slashed ? 1 : 0));
    const c = sha256Pair(toLittleEndian(validator.activationEligibilityEpoch), toLittleEndian(validator.activationEpoch));
    const d = sha256Pair(toLittleEndian(validator.exitEpoch), toLittleEndian(validator.withdrawableEpoch));
    return sha256Pair(sha256Pair(a, b), sha256Pair(c, d));
}

function merkleiseWithdrawal(withdrawal) {
    const addressRoot = ethers.hexlify(new Uint8Array([
        ...ethers.getBytes(withdrawal.withdrawalCredentials),
        ...new Uint8Array(12),
    ]));
    return sha256Pair(
        sha256Pair(toLittleEndian(withdrawal.index), toLittleEndian(withdrawal.validatorIndex)),
        sha256Pair(addressRoot, toLittleEndian(withdrawal.amountInGwei)),
    );
}

export default function() {
    describe.only('BeaconStateVerifier', () => {
        let owner,
            node,
            random;

        const farFutureEpoch = '18446744073709551615'.BN;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                random,
            ] = await ethers.getSigners();
        });

        it(printTitle('BeaconStateVerifier', 'Can verify slot with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const witnesses = [
                "0x107700ea94f26790066a7b5d248efdb9ead6d3a8265d69aa9a7466104a8359d2",
                "0x96a9cb37455ee3201aed37c6bd0598f07984571e5f0593c99941cb50af942cb1",
                "0xfb9369c355197b96acb9ac274ac94f6312078687edb1538fe8f0f718e55f8d22",
                "0x2f5e4432933c270f8c6d55b0e5bda1f771a8e6ffbcc222469eed4aa8e548d7a7",
                "0x4a1cdba46459907ad2e90e7781f1d6073cf605c7606449342b50a8eb9e5b137a",
                "0xfd0a4ea0112343eba60ae9a15bef34084e4df95fb5d34166a722f94edde023d2",
                "0xfcfc159f32c11dda7e315ff5d981cb1a247e4d26b3c2dc0f2aa3b842c5262a4f",
                "0xed688fdbfba04ce68e541cd09db8ea609fd951dd06b7dc171f337dcfb4e7774c",
                "0xd3b4850ac5f8ec9a4cc48295f972656a9b2ba8d35e665cd53c51a8bb448f9a63"
            ];

            const blockRoot = '0x26e397dd184ab83558a241a65847bf02406e26835b5a186fb0a2e05690958ad2';
            const slot = 11821055n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            const correctProof = {
                slot: slot,
                witnesses: witnesses,
            }

            assert.equal(await beaconStateVerifier.verifySlot(slotTimestamp, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify slot with Fulu state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 411392n * 32n + 1n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            // Fulu retains the pre-progressive BeaconState merkleization.
            const path = '011000010';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(toLittleEndian(slot), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifySlot(slotTimestamp, {
                slot,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify slot with progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14000001n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            // BeaconBlockHeader.state_root -> ProgressiveContainer BeaconState.slot
            const path = '01101001';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(toLittleEndian(slot), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            const correctProof = {
                slot,
                witnesses,
            };

            assert.equal(await beaconStateVerifier.verifySlot(slotTimestamp, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify slot with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 91876n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0x0668b8a83e07c91f25442dc1be473d866e63e8894feacb3fe32e77ae025842f8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                slot,
                witnesses: [
                    '0x8f9a8573a44269574a9a9c2d932243aaeeb9b88cd1ef1b83b3bea97f06d3bafe',
                    '0x4bd81940078fe23f5e5a1a91947398245a494241f4c89dce3671fc3aa2d83f7e',
                    '0x9838085ee6161a592ae32882db45f4fba7b8a325c1df0acae2166492e69738b8',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xafe317bfe6fc694a731849bcf078bd19bce7e7f421a7660b11ed774660cff497',
                    '0x9e24b79d77a2bdc2c5147f6e07cbd810b1e8c1c8df05ab885d498dfdd6702822',
                    '0x6190f7eb9b750a4897b973bd5ed8264ca93663bcaffafc3d81796088cadb4a95',
                ],
            };

            assert.equal(await verifier.verifySlot(slotTimestamp, proof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const witnesses = [
                '0xdac075cf29676e5da6a30cb2c2fab90b2661e0b921c599b384399380ae9ab5ab',
                '0x0e79aad03eedbd72563db50550bb4066abe422407b4f6edddce9ae47ae87e15b',
                '0xebdf30ee31c84aea37daf85c65c905719264e88f506188080d60ee4beb0a6bca',
                '0x5a768ecc1dceded186826a1ca61d3959ae00465f36040b5ab02d6385dd6ee3fa',
                '0xf845231c6cca9c053e7830ad67927bd1a7364f3ee01b209456b24db1cc0fa98f',
                '0xc22694f4ffe34e813350e4fa3fedeeba4ad118860b84d45447701472606ec9d1',
                '0xdeb26ad6b414dd628c2b3392ebe5ba3d41fc7104e9b563fc154ea002a5a95e31',
                '0x2c22e317222b49318ab555c08b5e1d0e7e226515fe5e4797887c9b3a609700be',
                '0x9f80e99e8d1ba1b236466a03f3f59015dfabe3b6d35e566993dcc959e5824ee3',
                '0x73e279452b714583a3bf38d7c37e7ea275e28cd09abe60b11f941a12e64f4241',
                '0x28394ea21c79ad3b29d7fbb8b252d96150b211b60900517b012eed8afdb92a3f',
                '0xd7ec1342a5f06b9f60fdc95761c1dbdf01f31f5a28d326652dc2d9f879c297c8',
                '0x3823b57415d99bba0a6089026e692c2e9817c750e42e2517511ef5cf29070d05',
                '0x6a7886b5f8716f0e12f359d9025b51d764130c235b1115c9faee188cecc99df6',
                '0x3f7ec07faa352ae9d48eb0d48d65dc952eedf590bac5cff6484ae43504170716',
                '0x7be17af70e96360a0cde54b7eac5e0850e3a55f13995494006b052fda415fd9c',
                '0x50cb128a7ee63948dc8a8959609f24e19cc5d4dd48ba1d02bbb5fd61ed938dad',
                '0xff99326be45cd5416caf569a7562acaaf63a74d40b66d2f33a0738846e3366a5',
                '0x2fe03ec77e9a4653a29520320269fd0e44622efd0bd5c114a84b5ad3d476341f',
                '0xfb40cfe24c512cf2df420be3204f1c60e882d27f3ea63280c4b7c03c691a9a7f',
                '0xee50bfe01d2ea4bdf323be746769cc44afff7457aea078483382c5c33ddc4230',
                '0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c',
                '0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167',
                '0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7',
                '0x31206fa80a50bb6abe29085058f16212212a60eec8f049fecb92d8c8e0a84bc0',
                '0x21352bfecbeddde993839f614c3dac0a3ee37543f9b412b16199dc158e23b544',
                '0x619e312724bb6d7c3153ed9de791d764a366b389af13c58bf8a8d90481a46765',
                '0x7cdd2986268250628d0c10e385c58c6191e6fbe05191bcc04f133f2cea72c1c4',
                '0x848930bd7ba8cac54661072113fb278869e07bb8587f91392933374d017bcbe1',
                '0x8869ff2c22b28cc10510d9853292803328be4fb0e80495e8bb8d271f5b889636',
                '0xb5fe28e79f1b850f8658246ce9b6a1e7b49fc06db7143e8fe0b4f2b0c5523a5c',
                '0x985e929f70af28d0bdd1a90a808f977f597c7c778c489e98d3bd8910d31ac0f7',
                '0xc6f67e02e6e4e1bdefb994c6098953f34636ba2b6ca20a4721d2b26a886722ff',
                '0x1c9a7e5ff1cf48b4ad1582d3f4e4a1004f3b20d8c5a2b71387a4254ad933ebc5',
                '0x2f075ae229646b6f6aed19a5e372cf295081401eb893ff599b3f9acc0c0d3e7d',
                '0x328921deb59612076801e8cd61592107b5c67c79b846595cc6320c395b46362c',
                '0xbfb909fdb236ad2411b4e4883810a074b840464689986c3f8a8091827e17c327',
                '0x55d8fb3687ba3ba49f342c77f5a1f89bec83d811446e1a467139213d640b6a74',
                '0xf7210d4f8e7e1039790e7bf4efa207555a10a6db1dd4b95da313aaa88b88fe76',
                '0xad21b516cbc645ffe34ab5de1c8aef8cd4e7f8d2b51e8e1456adc7563cda206f',
                '0xaf911d0000000000000000000000000000000000000000000000000000000000',
                '0xc6341f0000000000000000000000000000000000000000000000000000000000',
                '0x5aaa91f9944dda3f57d531e52f4127e134092e1e57350e5980dd654eee511488',
                '0xf99a074fcb6bb2a5b79601d206ab4700e897f0515626aaf30957aea3271b47b9',
                '0xdb4fe5420f82e43be50d01801979113267495914c66b45e9dff78c2ce393d27e',
                '0x4a1cdba46459907ad2e90e7781f1d6073cf605c7606449342b50a8eb9e5b137a',
                '0xfd0a4ea0112343eba60ae9a15bef34084e4df95fb5d34166a722f94edde023d2',
                '0xfcfc159f32c11dda7e315ff5d981cb1a247e4d26b3c2dc0f2aa3b842c5262a4f',
                '0xed688fdbfba04ce68e541cd09db8ea609fd951dd06b7dc171f337dcfb4e7774c',
                '0xd3b4850ac5f8ec9a4cc48295f972656a9b2ba8d35e665cd53c51a8bb448f9a63',
            ];

            const blockRoot = '0x26e397dd184ab83558a241a65847bf02406e26835b5a186fb0a2e05690958ad2';
            const slot = 11821055n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            const tooOldSlot = 100000n;
            const tooOldSlotTimestamp = (tooOldSlot * 12n + 1606824023n) + 12n;

            const correctProof = {
                validatorIndex: 1060378,
                validator: {
                    pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                    withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: witnesses,
            };

            const incorrectProof = {
                validatorIndex: 1060378,
                validator: {
                    pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                    withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: [
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    ...witnesses.slice(1),
                ],
            };

            const invalidWitnessLengthProof = {
                validatorIndex: 1060378,
                validator: {
                    pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                    withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: [
                    ...witnesses.slice(1),
                ],
            };

            const invalidCredentialsProof = {
                validatorIndex: 1060378,
                validator: {
                    pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                    withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293e',
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: witnesses,
            };

            const tooOldProof = {
                validatorIndex: 1060378,
                validator: {
                    pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                    withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: witnesses,
            };

            await shouldRevert(
                beaconStateVerifier.verifyValidator(tooOldSlotTimestamp, tooOldSlot, tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                beaconStateVerifier.verifyValidator(slotTimestamp, slot, invalidWitnessLengthProof),
                'Accepted invalid witness length',
                'Invalid witness length',
            );
            assert.equal(await beaconStateVerifier.verifyValidator(slotTimestamp, slot, incorrectProof), false);
            assert.equal(await beaconStateVerifier.verifyValidator(slotTimestamp, slot, invalidCredentialsProof), false);
            assert.equal(await beaconStateVerifier.verifyValidator(slotTimestamp, slot, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator with progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14000002n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const validatorIndex = 50;
            const validator = {
                pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                effectiveBalance: 32000000000n,
                slashed: false,
                activationEligibilityEpoch: 246886n,
                activationEpoch: 247130n,
                exitEpoch: farFutureEpoch,
                withdrawableEpoch: farFutureEpoch,
            };
            // BeaconBlockHeader.state_root -> ProgressiveContainer BeaconState.validators
            // -> ProgressiveList validators[50]
            const path = '011' + '01100110' + '01110011101';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseValidator(validator), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifyValidator(slotTimestamp, slot, {
                validatorIndex,
                validator,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 90000n],
                beaconRoots.target,
            );

            const slot = 91680n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0x92dc3cb65703108285c4e0f6bc40dbc7d11e8b31c1373eb5b70ec0be17ae7138';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                validatorIndex: 50,
                validator: {
                    pubkey: '0x869e6479b06650ab6d2d09816a1a96571f220ee9a34a3671803ad098c9fef8081997eeb1b159fdb73b0689b23bc757d8',
                    withdrawalCredentials: '0x020000000000000000000000f97e180c050e5ab072211ad2c213eb5aee4df134',
                    effectiveBalance: 1026000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 0,
                    activationEpoch: 0,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: [
                    '0x055483322e4d385e486bf89fffc2441dc5e0171e87b94b995c43bba73723486c',
                    '0xa3ae6841bad6ce67077f52a3a5228350022d8b41eb6c72afeff13bbc286542e3',
                    '0x69944a466f040f194342ef2d9ba958289e52df7ec2d8bc928c00574d35cbbc9c',
                    '0xba6c4a690a198ae70c1055661666681c9987357ec4a6a8cf0d922b84728f9fa5',
                    '0x3ac8b9605ac6775e7ed0a2ed7152691d93cef76e93ba4517e3adbfe7a06dc3bc',
                    '0xd4ed2a4b46532b98fd5ad46398f0807257b22f6d1b07c2c52e0ca16a7b1c01e3',
                    '0xafbfe83c468859a88c07a6aef6d59b47bf7133830b0fe5029133b5c57c061b76',
                    '0x3fa144ce1be3852b217eecdaf3ef52e66d6d8d0aec2d27b8a3221284b85940d5',
                    '0x95bc0549378f2becb7c936f0e1162001857333a71d40e07f9ed1ad119e374ab6',
                    '0x1832df13c6cfe44ca0b188aa3600f7d1402bb7e1f9fb97d32ecec23b82656566',
                    '0x38ae070000000000000000000000000000000000000000000000000000000000',
                    '0x8291b1313b48ce4a868288d6474011affae2a7a7fb494c762e551e4e724495d7',
                    '0x508eae470c21d09df5b0a91f767d2242e81197e50118848a7f74f2791d0a4cd8',
                    '0x67a583e404781da630f5577874d1a06a6438aa1ce29c549ea6c06fcdd29b17a9',
                    '0xaa754c6c77aea6ce2d71ffe86a330770438423d0f8fd958ba0c2335438d8842d',
                    '0xb9e14c2e281f9d37cb50bc3dbf7b0c750702870b1d7b64066f7f2e61ca895763',
                    '0xb4ce7071f001882bb95225375549ed88216b247a936e86d5377646720721cfc7',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0x0e8f15f4c4fc21419851c19a70b897edbe69a3e3a13c519f9276e1de60425550',
                    '0x3f80cbbfed9998228414b112af68c9800f4154c5d2e7cc04c309b9fce2e17536',
                    '0x17535363b2e9d7171b106116cebc34fea3917683832458b4d5e06ccdb01302e0',
                ],
            };

            assert.equal(await verifier.verifyValidator(slotTimestamp, slot, proof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify withdrawal with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const witnesses = [
                '0x56ebcae55f5161bd71226301b4c751ef433864c820c8d09361ca1a74758dd72c', '0x162cc35aa31a7cf1790ca34860c7e7a63f1ab2529f66d99fa1a872aea0bcf529',
                '0x60df1c1e8c19fa3de668e029902080838b9dd7ab7fec07697512023010f94d8e', '0x2096b4b750bdd7e22648c95e859efbf140e3da2ddd9ccdd95f3eba97d8fc121b',
                '0x1000000000000000000000000000000000000000000000000000000000000000', '0x0000080000000000000000000000000000000000000000000000000000000000',
                '0x61f017d3d8dee5ba8c68636e51a096ed3f523bbf29209fdb88711ff91a013c00', '0x268dfefa9d9326b73496fceb1f0a5ef42c8186889d0e3afd04c96ea87438120c',
                '0xd85a7f6d61f27841b359f9d59db3adddd1208a0ea924ffbc9c229220f5a23c5a', '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                '0xfd243838556ef257a4f3fd56272677a294c981de157694a3908dc9c08ca75d7a', '0xbd44a705c5063628996d4655f67571bcb9feadccab563f32235b08f8d52e9c7d',
                '0x6dd3b9955d892d92338b19976fd07084bfe88a76c3063482b7f30ee60feb2a58', '0x0a08a05a0b40226edaf0b2f1283eef98aca4b4cbe11e5a5add681fb78a15e807',
                '0x0000000000000000000000000000000000000000000000000000000000000000', '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                '0xa5f81459647ffebe8131ca4450ab282041ee9392788322920d6c6453e0d3703b',
                '0x7fa5e2df1bc7aa2f1530cd0bf1d3eab30ab12c4c1759429be374f5ed5bbbe43f', '0x409b0b10e9827ef913ad8961fc41b5dd5a01958c74e216fcde0d41e4738cd35c',
                '0xde3665f1b9e597580bb07de60cea574c5979a7e004d3b32e374a6350cce8fac5', '0xe7be85faefef9065463ec965fc39cfca593eb821ab779ea554f75524c9f60a5a',
                '0x9aab9f93f2e6677e57dd7050f31c9f98a35b8a43baca479a7bcb19c2eda73dee', '0x9e81de4708be5491b91ac6063e8ddd6fdd337ee4e0a0cba3d514645f096455c8',
                '0x66e126f270d3a2e25f45a07f376e99d8d337294ae07881402b4559f6ab4aa196', '0x1a49505aca09512fe47c707f8e904b230c91f691ec5e740d56b4f114897f41d3',
                '0x7bf09154ce4ecb3b37e79aab07747b10daebf5beef9ea8bf21dabf19c1882ef4', '0xc66785fa60eea935ffd8f68b04add1c62ef58e38e981a9531a7dd0278efcd26b',
                '0xf3c3f22873777b958507460c3537f0bd918c418e5addf3a03430cff26ee07d9e', '0x687f364236011235b2b4e40731cca0162739608af0294a6d4b576b5aecf51e57',
                '0x4fbd98fec8d190f77e452402b07aa8bf65847a2e2377f2e37065be5a9fa265e9', '0xd24aa06a0c8898472fa28ae9b982d7e392936e02d8cb53c48197e2edf3ba9ad5',
                '0xbef846d51e9bc2f7d07e91d4ef8c723e086a7df6e046fcea4bd477628c19e8a7', '0x542dea61bd1defaed4819d65ead85d75d6d940a3d2dded3749e725536acd8a4b',
                '0x3e177dc62135a265fafb6040763bf023d30f7540828b152d3473604a9e887eef', '0xa61ec140c4dee2bec895af537f2ef19376fac4ddb292ad7352809d7d5926461e',
                '0x2395c64f50239f14feea5dbe13c65d405e0d4be2d25e8995d8f64b94f83014fc',
                '0x032ffdac4b987092a708a481a6aa53c66aa874fe96a9f689031715ffa726fee4',
                '0xbe6d4ac575061b5182c9112451fdc189c2d3dc3a882b4c06c365e0acded0d600', '0x6cb1b243918374de6252a32aa24a34e0e40f3df71b7b51e6a59d0e99e9109d2d',
            ];

            const blockRoot = '0xe39be859f0aaa98d1c269252388115284366451b58ed082801593dbbfccd1876';
            const slot = 11834166n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            const tooOldSlot = 100000n;
            const tooOldSlotTimestamp = (tooOldSlot * 12n + 1606824023n) + 12n;

            const correctProof = {
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses,
            };

            const invalidProof = {
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: [
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    ...witnesses.slice(1),
                ],
            };

            const invalidWitnessLengthProof = {
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: [
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                ],
            };

            const incorrectAmountProof = {
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165415n,
                },
                witnesses: witnesses,
            };

            const tooOldProof = {
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses,
            };

            const tooNewProof = {
                withdrawalSlot: slot,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses,
            };

            const tooOldWithdrawalProof = {
                withdrawalSlot: 1000000n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses,
            };

            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(tooOldSlotTimestamp, tooOldSlot, tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, tooOldWithdrawalProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, tooNewProof),
                'Accepted too recent proof',
                'Invalid slot for proof',
            );
            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, invalidWitnessLengthProof),
                'Accepted invalid witness length',
                'Invalid witness length',
            );
            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, invalidProof), false);
            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, incorrectAmountProof), false);
            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical withdrawal with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const witnesses = [
                '0x74cfc71c3b83d9ebf5efd08392c92a9dda42503dcad6803c73891d9053a70320',
                '0x93c4b29ead59124360480d4caa9654a5b0fdd65db4ea7a86b16e4b7b83bda95e',
                '0xe7fe50fcdea47e2a2f5a3fc124aa511e3509f7a15ba069b1ad498bbbe95b720d',
                '0x5deacc1ef4e1ce7209c023fec1ef703b2614c01be007c9d840ae16d5fd4a02db',
                '0x1000000000000000000000000000000000000000000000000000000000000000',
                '0x00000c0000000000000000000000000000000000000000000000000000000000',
                '0x468ac3f202e83aa85fc823833d1dd7e4c068247229ca20c93e03e09eec71b1f2',
                '0xdb4a3d44ad1639a5a33df330dacb43b1e9ffae933b39777284cc267cfb3b5e23',
                '0x554d7982fbf2b551698286f263c15bac3dab59aec4dad9ab151d65f87d2cebe3',
                '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                '0x78b61adb7dabe11b361c00c4d0ce8bc65ba5b25e986d53dd6c5f384c61407893',
                '0x969cccd23584b6103d59d51cce0c05c509f3c1c6388dee057aa797464fc156c2',
                '0x6dd3b9955d892d92338b19976fd07084bfe88a76c3063482b7f30ee60feb2a58',
                '0xade691acdbbfaad0986c3207cace76269ccfcbb43a7e7235e5c73034d922ce7b',
                '0x0000000000000000000000000000000000000000000000000000000000000000',
                '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                '0x6f09091e8b0c43ba767483032e44b9f7d188b5ccde3934bc34a13f25025a44fb',
                '0xdeb1cb883675e814da9c601b922023255ce1ada869d9094b29c63e4ac96cc439',
                '0x1a9b340cae67f6d4e0a710df062a1d60c35952905a1159a3e900a854cebb0cd3',
                '0x65df01553a531d51917456384133ddf678c6c889ce6162de9ea7dbe835564823',
                '0x9bdf14859c294df8627ca673abe55e5801b721ce4badb277e234b036439cc8a2',
                '0x9f980cdfbfaed8bd6dbc14b0e58eea9a78188bee1841289e61b2cb2b9b22e135',
                '0x04a9a49769c78c902f06bac0f0f4ab1d20a6f6a963e17d09f8bc8967a8a533c2',
                '0x9845c6e05b93d780abec431be46ed8693b206d12f826236710a0ab204c15d407',
                '0x223fbfd99ba532434d7a901e9571a02ce9abbe7ff8605e098f0377835126298b',
                '0xaf26da67d02d6cff9fb740177f937f8aa9254f72b1113e22dfe01b7bc32ef2e9',
                '0xd3163825b7a6359405907912a8deb6bf9367ce842fe7e84e43d87f331779f816',
                '0x64f656b7890973e7d6f1a52d2a9965662c6e4d7a70da5b8ea4a719bfbe7221a9',
                '0xf4e1a264be26a17650d3135f871c1fa481bdd5b0aec7e23385ea945e32357a88',
                '0x7c5fe548aa993a78739b599b58480c5e12cdf4ca1ece180d2f98af468bf4ee8b',
                '0x678bc097998c1ab127329d2416aa2149f9d61f3e174813f2fcc1c5f3f82dfbbe',
                '0xa908558027c3e780730442c080ea5e51310bb79f55ea7d65544bc821fff01b9d',
                '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                '0xdc4b1fb0c6da070776aff72f3cabdd69fe1bc80b17510e8389f0fe7b99ec13b4',
                '0x45bc0e84058bf2d6e40391a50d54957c151ab001f998119a4a5815b008a0b2de',
                '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                '0x42ac8905f23f1485ab055f9e45c206724a7dfbefc879f6b884f9e0f952a3bfc1',
                '0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1',
                '0x02fc550c3883e5fa2c1337af5d47a1ab421de5b139ecd19f16c7e8dcb76a1955',
                '0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193',
                '0xbc3c027ad6604c5f99c79faa8fb0756a92f9a23af6eda520d99f6fec48f6cce3',
                '0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b',
                '0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220',
                '0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f',
                '0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e',
                '0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784',
                '0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb',
                '0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb',
                '0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab',
                '0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4',
                '0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f',
                '0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa',
                '0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c',
                '0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167',
                '0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7',
                '0xae02000000000000000000000000000000000000000000000000000000000000',
                '0xccf8130000000000000000000000000000000000000000000000000000000000',
                '0x93293d640cd7e57999f2add8910dd15145c57166082acd081ca2fbbec5cd2cbf',
                '0xe1be7bbc04e914d5555f015e7518c9db4668d32be20256b25f54a6094f82c759',
                '0xc431c70147e808fa3bbd66145251d3678b97f68913d011f0adedb116498ff7ba',
                '0x54649e50d85164e2d61f38905ea2f507e51812db6b9582e87d1db86c071b9983',
                '0x2395c64f50239f14feea5dbe13c65d405e0d4be2d25e8995d8f64b94f83014fc',
                '0x032ffdac4b987092a708a481a6aa53c66aa874fe96a9f689031715ffa726fee4',
                '0xbe6d4ac575061b5182c9112451fdc189c2d3dc3a882b4c06c365e0acded0d600',
                '0x6cb1b243918374de6252a32aa24a34e0e40f3df71b7b51e6a59d0e99e9109d2d',
            ];

            const blockRoot = '0xe39be859f0aaa98d1c269252388115284366451b58ed082801593dbbfccd1876';
            const slot = 11834166n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            const correctProof = {
                withdrawalSlot: 11813956n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 88947435n,
                    validatorIndex: 688322n,
                    withdrawalCredentials: '0x42a93a9f5cfda54716c414b6eaf07cf512f46ead',
                    amountInGwei: 19212998n,
                },
                witnesses: witnesses,
            };

            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify pre-Gloas withdrawal from progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14000000n;
            const withdrawalSlot = slot - 1n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const withdrawal = {
                index: 90000000n,
                validatorIndex: 50,
                withdrawalCredentials: '0x42a93a9f5cfda54716c414b6eaf07cf512f46ead',
                amountInGwei: 32000000000n,
            };
            // The state-side path is progressive, while all nodes below the old
            // block root retain their pre-Gloas paths.
            const path = '011'
                + '01100000'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '100'
                + '1001'
                + '01110'
                + '00000';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseWithdrawal(withdrawal), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum: 0,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical pre-Gloas withdrawal from progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14000100n;
            const withdrawalSlot = 13200000n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const withdrawal = {
                index: 89000000n,
                validatorIndex: 688322,
                withdrawalCredentials: '0x42a93a9f5cfda54716c414b6eaf07cf512f46ead',
                amountInGwei: 19212998n,
            };
            const historicalSummaryOffset = (194048n * 32n) / 8192n;
            const historicalSummaryIndex = withdrawalSlot / 8192n - historicalSummaryOffset;
            // Progressive BeaconState.historical_summaries, followed by the
            // unchanged List, HistoricalSummary, block_roots, and old block paths.
            const path = '011'
                + '01110000110'
                + '0' + historicalSummaryIndex.toString(2).padStart(24, '0')
                + '0'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '100'
                + '1001'
                + '01110'
                + '00000';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseWithdrawal(withdrawal), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum: 0,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify post-Gloas withdrawal from progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14000010n;
            const withdrawalSlot = 14000000n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const withdrawalNum = 3;
            const withdrawal = {
                index: 91000000n,
                validatorIndex: 123456,
                withdrawalCredentials: '0xf97e180c050e5ab072211ad2c213eb5aee4df134',
                amountInGwei: 1026000000000n,
            };
            // Current BeaconState.state_roots points to the BeaconState at the
            // withdrawal slot, then the proof enters its ProgressiveList of
            // payload_expected_withdrawals.
            const path = '011'
                + '01100001'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '01110010111'
                + '01010';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseWithdrawal(withdrawal), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical post-Gloas withdrawal from progressive state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();

            const slot = 14010000n;
            const withdrawalSlot = 14000001n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const withdrawal = {
                index: 92000000n,
                validatorIndex: 654321,
                withdrawalCredentials: '0x42a93a9f5cfda54716c414b6eaf07cf512f46ead',
                amountInGwei: 32000000000n,
            };
            const historicalSummaryOffset = (194048n * 32n) / 8192n;
            const historicalSummaryIndex = withdrawalSlot / 8192n - historicalSummaryOffset;
            // The historical summary's state root leads to the withdrawal-slot
            // BeaconState and its ProgressiveList of expected withdrawals.
            const path = '011'
                + '01110000110'
                + '0' + historicalSummaryIndex.toString(2).padStart(24, '0')
                + '1'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '01110010111'
                + '00';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseWithdrawal(withdrawal), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await beaconStateVerifier.verifyWithdrawal(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum: 0,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify withdrawal with real historical post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 91875n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0xafe317bfe6fc694a731849bcf078bd19bce7e7f421a7660b11ed774660cff497';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                withdrawalSlot: 81101n,
                withdrawalNum: 1,
                withdrawal: {
                    index: 60483n,
                    validatorIndex: 1,
                    withdrawalCredentials: '0xf97e180c050e5ab072211ad2c213eb5aee4df134',
                    amountInGwei: 1897344n,
                },
                witnesses: [
                    '0x35cf4422ca5c70a4f9d75b0419ac7086ce1aef262f285f06cfca048b9fe3c790',
                    '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0xbe027e20a401335975cb10257325264648d5570f38d184cdd50807ba18e4efca',
                    '0x0300000000000000000000000000000000000000000000000000000000000000',
                    '0x5472ca2bbb3150e60010acb9397b71d170745563162bf70086e0ac66ce9df3a9',
                    '0x60b56edfdbad3e8e7bc1b643097a1946da4aa00a75c944129b07b61311c5448d',
                    '0xc86ed891df471e831499a9a4e8bb8c6a70ca78026aa73efba7187caac4542d35',
                    '0x371648bcb561d99221bdadf0036379405e86dcf693331639a9a1dfbb2b465871',
                    '0xbf264ea26c4b0d34aad694ad595c40103d0317694b5b6626dd54ea0d90670fef',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x4084ae6839da183f42a6065d965d4989892eb943fa4b967e1025dd5d09c30e28',
                    '0x7ef2ef413c10b2cad220be1f6fc6ae403050720252fb4943bba16e0bf3cb0193',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0x5acbf74bccbc1668fa7bc4c589048dec6742ab4cff6b7ca9bd0340bcb2e76520',
                    '0xdb44953246de854ef01ddf86430f59b6cba7a708eafe6c7d0871729942575bf4',
                    '0xf2fd3b54bfa60d73bc4cacb0be1060351dd5e954a4d97e3f67ddefecc972ae85',
                    '0xbbe449838073e4add373471572733b0b7000c0d869dd42cf833e5ea6bc859ed6',
                    '0x40024c1bfacaaefacb785eff72486ed38da6c64c78e854cc9665ae1c07ba5cbc',
                    '0x85d3ea974c5e1cbcf17efd7870df0dddbd8168691b3f3563a436626996764df9',
                    '0xf1da603db2d167fc270a6ff8ba9f6c53c909d6b573ae3de039026a2e0eab482e',
                    '0xaf459c0a6fad2d63a1b96e3eb5150afb078a14e02bbb50164d129bd3c98c9388',
                    '0xdc9ded8b2468d1364ee254023daf5d26b4d133bfa67bad623351b92501491782',
                    '0xa00ad84cfa920c13ed3b4d163e4cc4318a296c253634a0a9196ba2b325ad232c',
                    '0x659426a1b743a2035d32c0a082b824f4f69a54b835d4d43183afb889717db5aa',
                    '0x20a92456a1f9780c73daef6e7713a04970e36ede8ac7951f2cc97a0f0dac75f7',
                    '0x60add01521f6523d538e5a39b5f003ea8230bb7c537c0aaf3a6786ac4e028baf',
                    '0x1ce56fa55c57cd1da95a0f5cfe89ed44c92215392bc66fbf2912ea3805c610c2',
                    '0x3a83f12a5deb65698040501c508724b5398f4c36ba324884ef5a725b5e81eaea',
                    '0xb94c2c04f5e0ba1a339be7f8e52d78e311126eec231fed7ace719eaef70316c3',
                    '0xdb56114e00fdd4c1f85c892bf35ac9a89289aaecb1ebd0a96cde606a748b5d71',
                    '0x17ad9f0312270412b9260d1a590b0eaf58aea8c69b19b6c2ccfcaa823770c231',
                    '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1',
                    '0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c',
                    '0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193',
                    '0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1',
                    '0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b',
                    '0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220',
                    '0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f',
                    '0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e',
                    '0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784',
                    '0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb',
                    '0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb',
                    '0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab',
                    '0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4',
                    '0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f',
                    '0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa',
                    '0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c',
                    '0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167',
                    '0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7',
                    '0x0b00000000000000000000000000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0xe1714ea65a15336cc4994916bc04ded91fb9d492c18b7ecdd022a3eb4f02b7ab',
                    '0xf66dd3787f3837e791dcf33690cf9b00f06dbeec2634089cb11312d1f85a2a35',
                    '0x43ee937fb08cc68e8c9b7b081929a61c04fef447a9653605668c716dc1088d44',
                    '0x10bba43e0d9c849e7ff5ce963bbaa6ba7b77a079d48a70ba5f16d5aeef6e8213',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0xca603519de9b52de4de0f3716575afad58f87bc4bc987090117dec4aa50ab35f',
                    '0x6a6d9aeb854adfefbe3a276be86de60b997b031d3807b47cd44556a2cb0423e4',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0x55492e39406e501ff86d922bc609755b81e1511e29063b9b3a41d1c120de7a36',
                    '0x248df14624cb1d8da356e6ba16241810fb159b2eb53762bc01232f61410cae5b',
                    '0xb528efc784153932f844bfa8da8d8172f47ee1b025921aadf824fe355e31e7b5',
                ],
            };

            assert.equal(await verifier.verifyWithdrawal(slotTimestamp, slot, proof), true);
        });
    });
}
