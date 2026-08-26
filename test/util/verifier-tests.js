import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { artifacts, BeaconStateVerifier, BlockRootsMock } from '../_utils/artifacts';
import * as assert from 'assert';
import { shouldRevert } from '../_utils/testing';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { globalSnapShot } from '../_utils/snapshotting';
import { registerNode, setNodeTrusted } from '../_helpers/node';
import { compressABI } from '../_utils/contract';
import { encodeFinalBalanceProofV2, encodeValidatorProofV1 } from '../_utils/beacon';

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

function packUint64s(values) {
    assert.equal(values.length, 4);
    const result = new Uint8Array(32);
    values.forEach((value, lane) => {
        let v = BigInt(value);
        for (let byte = 0; byte < 8; ++byte) {
            result[lane * 8 + byte] = Number(v & 0xffn);
            v >>= 8n;
        }
        assert.equal(v, 0n, 'Packed value exceeds uint64');
    });
    return ethers.hexlify(result);
}

function sha256Pair(left, right) {
    return ethers.sha256(ethers.concat([left, right]));
}

function makeWitnesses(length) {
    return Array.from({ length }, (_, i) => ethers.zeroPadValue(ethers.toBeHex(i + 1), 32));
}

function progressivePath(index) {
    let remaining = BigInt(index);
    let groupSize = 1n;
    let groupDepth = 0;
    let path = '0';
    while (remaining >= groupSize) {
        remaining -= groupSize;
        path += '1';
        groupSize *= 4n;
        groupDepth += 2;
    }
    const offset = groupDepth === 0 ? '' : remaining.toString(2).padStart(groupDepth, '0');
    return path + '0' + offset;
}

// Builds independent single-leaf witnesses for several leaves in one synthetic
// tree. This lets the versioned bundle prove all of its facts against one root.
function makeMultiProofs(leaves) {
    const leafMap = new Map(leaves.map(({ path, leaf }) => [path, leaf]));
    const paths = [...leafMap.keys()];
    for (const path of paths) {
        assert.equal(paths.some(other => other !== path && other.startsWith(path)), false, 'Proof leaf is an ancestor');
    }

    const nodes = new Map();
    function node(prefix) {
        if (nodes.has(prefix)) return nodes.get(prefix);
        if (leafMap.has(prefix)) return leafMap.get(prefix);
        if (!paths.some(path => path.startsWith(prefix))) {
            return ethers.sha256(ethers.toUtf8Bytes(`unused:${prefix}`));
        }
        const value = sha256Pair(node(prefix + '0'), node(prefix + '1'));
        nodes.set(prefix, value);
        return value;
    }

    const witnesses = new Map();
    for (const path of paths) {
        const proof = [];
        for (let i = path.length - 1; i >= 0; --i) {
            const sibling = path.slice(0, i) + (path[i] === '0' ? '1' : '0');
            proof.push(node(sibling));
        }
        witnesses.set(path, proof);
    }
    return { root: node(''), witnesses };
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
    describe('BeaconStateVerifier', () => {
        let owner,
            node,
            random,
            verifierHarness;

        const farFutureEpoch = '18446744073709551615'.BN;

        // Setup
        before(async () => {
            await globalSnapShot();

            [
                owner,
                node,
                random,
            ] = await ethers.getSigners();

            // Megapool scenarios disable verification on this shared mock.
            // Verifier tests must always exercise the real implementation.
            const beaconRoots = await BeaconStateVerifier.deployed();
            await (await beaconRoots.setDisabled(false)).wait();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            verifierHarness = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [74240n * 32n, 144896n * 32n, 194048n * 32n, 269568n * 32n, 364032n * 32n, 411392n * 32n, 14000000n],
                beaconRoots.target,
            );
        });

        it(printTitle('BeaconStateVerifier', 'Exposes only canonical versioned proof entrypoints'), async () => {
            const expectedInputs = ['uint64', 'uint256', 'bytes'];
            for (const name of ['verifyValidator', 'verifyFinalBalance']) {
                const functions = verifierHarness.interface.fragments.filter(
                    fragment => fragment.type === 'function' && fragment.name === name,
                );
                assert.equal(functions.length, 1, `Unexpected overloads for ${name}`);
                assert.deepEqual(functions[0].inputs.map(input => input.type), expectedInputs);
            }
            for (const name of ['verifyValidatorV2', 'verifyFinalBalanceV2', 'verifyWithdrawal', 'verifySlot']) {
                const functions = verifierHarness.interface.fragments.filter(
                    fragment => fragment.type === 'function' && fragment.name === name,
                );
                assert.equal(functions.length, 0, `Deprecated ${name} selector remains`);
            }
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

            assert.equal(await verifierHarness.verifySlotProof(slotTimestamp, correctProof), true);
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

            assert.equal(await verifierHarness.verifySlotProof(slotTimestamp, {
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

            assert.equal(await verifierHarness.verifySlotProof(slotTimestamp, correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify slot with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
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

            assert.equal(await verifier.verifySlotProof(slotTimestamp, proof), true);
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
                verifierHarness.verifyValidatorProof(tooOldSlotTimestamp, tooOldSlot, tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                verifierHarness.verifyValidatorProof(slotTimestamp, slot, invalidWitnessLengthProof),
                'Accepted invalid witness length',
                'Invalid witness length',
            );
            assert.equal(await verifierHarness.verifyValidatorProof(slotTimestamp, slot, incorrectProof), false);
            assert.equal(await verifierHarness.verifyValidatorProof(slotTimestamp, slot, invalidCredentialsProof), false);
            assert.equal(await verifierHarness.verifyValidatorProof(slotTimestamp, slot, correctProof), true);
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

            assert.equal(await verifierHarness.verifyValidatorProof(slotTimestamp, slot, {
                validatorIndex,
                validator,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
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

            assert.equal(await verifier.verifyValidatorProof(slotTimestamp, slot, proof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator balance with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 313311n;
            const balanceSlot = 313310n;
            const slotTimestamp = slot * 12n;
            const validatorIndex = 49n;
            const blockRoot = '0x36d3092e8bc10fa1294a0462992ca1440d10ccf261c3d9dd3e2b8ed26c3bd3b8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                balanceChunk: '0xef124452f0000000ac6d0558f0000000cea4635bf000000050489659f0000000',
                witnesses: [
                    '0xeb56f753f0000000de6fab58f00000004168365ff0000000c441c869f0000000',
                    '0xd65f415f9b7dd1657c5aa3e4a543a604a4e113d5f24a2afeee008a400ca368e7',
                    '0x7dc7397fa901396efa3760afaceeba28281c568ebf170efc955473ef28ebbe7c',
                    '0x07880735040e2ac2a8abab18e3492f7a790e4b61821d6a14969368f50ae6c69b',
                    '0x197e92b72ea52373b23f81c71dd8a0787be682996bda26fb6dde53a05b2e09dd',
                    '0xcb1646df72c5df69d08125a3dcc2cc289b0dc723f879ecb0345bda8b6630e6c1',
                    '0x000050d6dc0100000000000000000000d8e450d6dc010000aa677f4ef0000000',
                    '0x4eaf070000000000000000000000000000000000000000000000000000000000',
                    '0x386c121d11b62af2671572f49dc6217c887c1e288a9eb29a233f0a3588d14b36',
                    '0x831cc415b9a3c2f9bf516582abf2830f9527209cf3218a134c323282c7d8ce6a',
                    '0xa8683c393f9820925081ee90893003ea8023c99117487faeb0dc1fc341ed7c12',
                    '0xd5bcda6faf58ad26aa7126b8d484435aa9c6f73f57c7f7aa05c7f272166e0e4a',
                    '0x7a609eef109996fd051989b13372c320bc48feecf9f489cf326b4cc7479b58fc',
                    '0xe2eded9fe5654eba7c0fb9f8e3ef91135ba91f6a22ae8e42175720c85f9cbfc3',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0x4c7c73bf2bd0b1419ba37b84df109869272621e88e458e63c3344ab4b9957387',
                    '0xec0613b85e2af9902fa85a8ab723262e77f3d35a8d39c4b29cecc691d6507afb',
                    '0xa5ecadb652a7b63fc6988868cb4d8448f44cfc893ef2c8386eefe2cd687b1a8d',
                    '0xf14f4caf0530cb46f810a6fa4db3fed7a4c814a8598d66144fc4cfd63b60a2d0',
                    '0xda54850c334bdb2a2d6dcc63f1732c4eccbebf0307e16291b4459438bd0a1544',
                    '0x3baeb8124f18ac63a65cf08ec22ac6130a657c2437d460d2d64792f6ec79f963',
                    '0x84cd1276fa8ab9161bd09eaae9160f6c02a60395e60efbec6d32b53c763b29a0',
                    '0xc69f8e08932e668e3a1893beb258bb2c9664c45a3232754ad91fc8ee72cd92f1',
                    '0x9e00a958a07259d085a1353e47e5a72ac1b59914d7add3ea2f9aa0a8cedf67da',
                    '0xddffa5716bf5e1c798ee4bebf7b419259e94823729052f6378f698b471226c75',
                    '0x121c0e8fedff3043f6c5e96577310286e488258bd67932787f7aee65c041c000',
                    '0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1',
                    '0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916',
                    '0x4b726e233451bd18fc73bf2c7be86b26afefbe39a5a84215832c07500dbad986',
                    '0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae',
                    '0x6592e7a291cb32b4cac2471d3f90143de4f2fd7c58fbf0fedacb575b27d1c4a6',
                    '0x4050dc470dbe60edece0203793b84ea19bc1f11bbaca2903e835ec462d224c3d',
                    '0xe420eb24060044036eb7832913e60f823d49697106cb10dc8639dac610747fb2',
                    '0x00b068b1f2e5f6a90116aad75740ba8e98647434297425989ba565b81881ac04',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xb2f812271e9e9fb65dfb180abc303257fb399e6f7abd7d34bcaae366638eafe0',
                    '0x1bcc86e680437567fc58d387d364b86e1e5df33648d7c000cfbb5d0b11e81bcb',
                    '0x2e51e71f56dcc4976c11d43e9b8adb3acb89ac39b0769d6b6bbf6672eb70ec21',
                ],
            };

            assert.equal(
                await verifier.verifyValidatorBalance(slotTimestamp, slot, balanceSlot, validatorIndex, proof),
                true,
            );
            assert.equal(
                await verifier.verifyValidatorBalance(slotTimestamp, slot, balanceSlot, validatorIndex, {
                    ...proof,
                    balanceChunk: '0xee124452f0000000ac6d0558f0000000cea4635bf000000050489659f0000000',
                }),
                false,
            );
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical validator balance with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 313311n;
            const balanceSlot = 303310n;
            const slotTimestamp = slot * 12n;
            const validatorIndex = 49n;
            const blockRoot = '0x36d3092e8bc10fa1294a0462992ca1440d10ccf261c3d9dd3e2b8ed26c3bd3b8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Historical proof generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                balanceChunk: '0x97011344f000000075e8ca4af0000000f07bdc50f0000000e205284df0000000',
                witnesses: [
                    '0xb3c10147f00000008b6ee34cf00000000facbb54f00000004c83e35af0000000',
                    '0xdcaa015682f998e2d5fa6cdd92c19007986794de7e04a66d5c9b4ff2c9d2231b',
                    '0x33b8eb441fd81018c7c1e5d33cfbf2cf22cf5249e589a8300a9cc0fe42696847',
                    '0xe53e5442d6ec5f9f7b7a266fd2a10234a9e86e4ccefb9bc6229b3a0f123d916a',
                    '0x775844349dd8d43ab594b3ee19c1e6813733cfbbfba69400da251d86b188d910',
                    '0x0f83cc8e8742e807487f676ca1ab73e74d6eea3eb6c7db98b789a62f369bbf71',
                    '0x6c205ed6dc01000000000000000000001d8363d6dc010000d585fe41f0000000',
                    '0x4eaf070000000000000000000000000000000000000000000000000000000000',
                    '0xc2f71386993c8a7eed10eb2716fa7d2865c3deaee27cfeffaef851f5c565471a',
                    '0x588069512ef2d1f6197811b7e730454148793800ec4372db40f79bd3f636d616',
                    '0x536e7026706494434135d31506f9d096364abb5c21808d217a82be502c6c9fe8',
                    '0x8bff96a684b64f4de872ff5e5bc0e326b45ba04f24b392f8937b5cd5a70b425f',
                    '0x5819362a6e60d8bd522068f29a0acfa18f91dfa8e4240476933301960b6139a8',
                    '0xa5d221ca9b9c7dfe0817099bb3fb9bd5e3b78ea3fe40af10af7c5cab42a8f4e3',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xc12d2089d06a72c5e84ea02ad40e16861046fb0034e2c916fdf7141cd2c1cde9',
                    '0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6',
                    '0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82',
                    '0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db',
                    '0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28',
                    '0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a',
                    '0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009',
                    '0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe',
                    '0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1',
                    '0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5',
                    '0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07',
                    '0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1',
                    '0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916',
                    '0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135',
                    '0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415',
                    '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                    '0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d',
                    '0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c',
                    '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                    '0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee',
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
                    '0x2600000000000000000000000000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x40a6466913b4792a731aa0c7ee373a4aa8accbe1fa9f714ca0f29316a8219528',
                    '0x83bacc1cdaa6a6d4c8935e5f993c65e9dcd84e87e5e2e9b0fa667860646ab77e',
                    '0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672',
                    '0x3dfe8762f00602ee0d5a9314118e0fd355a8faccf94acf34e60d39d4b7a371b2',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x3049b83a35d021acb1ff145b4551f07d297c16bc9f743674e5375cebdeb10866',
                    '0x00b068b1f2e5f6a90116aad75740ba8e98647434297425989ba565b81881ac04',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xb2f812271e9e9fb65dfb180abc303257fb399e6f7abd7d34bcaae366638eafe0',
                    '0x1bcc86e680437567fc58d387d364b86e1e5df33648d7c000cfbb5d0b11e81bcb',
                    '0x2e51e71f56dcc4976c11d43e9b8adb3acb89ac39b0769d6b6bbf6672eb70ec21',
                ],
            };

            assert.equal(
                await verifier.verifyValidatorBalance(slotTimestamp, slot, balanceSlot, validatorIndex, proof),
                true,
            );
            assert.equal(
                await verifier.verifyValidatorBalance(slotTimestamp, slot, balanceSlot, validatorIndex, {
                    ...proof,
                    balanceChunk: '0x96011344f000000075e8ca4af0000000f07bdc50f0000000e205284df0000000',
                }),
                false,
            );
        });

        it(printTitle('BeaconStateVerifier', 'Can verify next withdrawal index with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 313311n;
            const withdrawalSlot = 313311n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0x36d3092e8bc10fa1294a0462992ca1440d10ccf261c3d9dd3e2b8ed26c3bd3b8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof of state[withdrawalSlot - 1].next_withdrawal_index generated
            // from real beacon state data on glamsterdam-devnet-7
            const proof = {
                nextWithdrawalIndex: 363515n,
                witnesses: [
                    '0x0be6010000000000000000000000000000000000000000000000000000000000',
                    '0x9e4ae32cf15a1d1ad9f8cffa20a4c7c10d3c3179c47f538baa36d087e4d40f11',
                    '0xf1d9ea837090cd501424dcf1a8acf3454f8de2fd936501f975bc4e3da74fb6e4',
                    '0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672',
                    '0x344b88e15a539f1cfb1c696f762cfe7b22ea0268a9a0ffc7ae4529c5da37e435',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0xb515ba6c126e552222c60561fa015e48e16773d2ab6c884263e03861d34f7259',
                    '0xe2eded9fe5654eba7c0fb9f8e3ef91135ba91f6a22ae8e42175720c85f9cbfc3',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0x4c7c73bf2bd0b1419ba37b84df109869272621e88e458e63c3344ab4b9957387',
                    '0xec0613b85e2af9902fa85a8ab723262e77f3d35a8d39c4b29cecc691d6507afb',
                    '0xa5ecadb652a7b63fc6988868cb4d8448f44cfc893ef2c8386eefe2cd687b1a8d',
                    '0xf14f4caf0530cb46f810a6fa4db3fed7a4c814a8598d66144fc4cfd63b60a2d0',
                    '0xda54850c334bdb2a2d6dcc63f1732c4eccbebf0307e16291b4459438bd0a1544',
                    '0x3baeb8124f18ac63a65cf08ec22ac6130a657c2437d460d2d64792f6ec79f963',
                    '0x84cd1276fa8ab9161bd09eaae9160f6c02a60395e60efbec6d32b53c763b29a0',
                    '0xc69f8e08932e668e3a1893beb258bb2c9664c45a3232754ad91fc8ee72cd92f1',
                    '0x9e00a958a07259d085a1353e47e5a72ac1b59914d7add3ea2f9aa0a8cedf67da',
                    '0xddffa5716bf5e1c798ee4bebf7b419259e94823729052f6378f698b471226c75',
                    '0x121c0e8fedff3043f6c5e96577310286e488258bd67932787f7aee65c041c000',
                    '0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1',
                    '0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916',
                    '0x4b726e233451bd18fc73bf2c7be86b26afefbe39a5a84215832c07500dbad986',
                    '0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae',
                    '0x6592e7a291cb32b4cac2471d3f90143de4f2fd7c58fbf0fedacb575b27d1c4a6',
                    '0x4050dc470dbe60edece0203793b84ea19bc1f11bbaca2903e835ec462d224c3d',
                    '0xe420eb24060044036eb7832913e60f823d49697106cb10dc8639dac610747fb2',
                    '0x00b068b1f2e5f6a90116aad75740ba8e98647434297425989ba565b81881ac04',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xb2f812271e9e9fb65dfb180abc303257fb399e6f7abd7d34bcaae366638eafe0',
                    '0x1bcc86e680437567fc58d387d364b86e1e5df33648d7c000cfbb5d0b11e81bcb',
                    '0x2e51e71f56dcc4976c11d43e9b8adb3acb89ac39b0769d6b6bbf6672eb70ec21',
                ],
            };

            assert.equal(
                await verifier.verifyNextWithdrawalIndex(slotTimestamp, slot, withdrawalSlot, proof),
                true,
            );
            assert.equal(
                await verifier.verifyNextWithdrawalIndex(slotTimestamp, slot, withdrawalSlot, {
                    ...proof,
                    nextWithdrawalIndex: proof.nextWithdrawalIndex + 1n,
                }),
                false,
            );
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical next withdrawal index with real post-Gloas state proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slot = 313311n;
            const withdrawalSlot = 303311n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0x36d3092e8bc10fa1294a0462992ca1440d10ccf261c3d9dd3e2b8ed26c3bd3b8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Historical proof of state[withdrawalSlot - 1].next_withdrawal_index
            // generated from real beacon state data on glamsterdam-devnet-7
            const proof = {
                nextWithdrawalIndex: 356353n,
                witnesses: [
                    '0x3f71070000000000000000000000000000000000000000000000000000000000',
                    '0x9440ec6f27629619b1cedf11d09a62b7c216027d7af6ba30c7e5d845ed43acd0',
                    '0xb19ad0896be9709b24511d7c04ebf6a793114fa71a80f9e62821b8a3ad374e90',
                    '0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672',
                    '0xae6c089c75b8f8a0046b943ce1627e474154891a78d48ddd7f2d03e5a5b9ea39',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x80a2274621c69b14ffe285fbf2e89835cc8e7ed129d69d81b449a44795a97faa',
                    '0xa5d221ca9b9c7dfe0817099bb3fb9bd5e3b78ea3fe40af10af7c5cab42a8f4e3',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xc12d2089d06a72c5e84ea02ad40e16861046fb0034e2c916fdf7141cd2c1cde9',
                    '0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6',
                    '0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82',
                    '0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db',
                    '0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28',
                    '0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a',
                    '0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009',
                    '0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe',
                    '0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1',
                    '0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5',
                    '0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07',
                    '0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1',
                    '0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916',
                    '0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135',
                    '0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415',
                    '0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b',
                    '0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d',
                    '0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c',
                    '0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c',
                    '0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee',
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
                    '0x2600000000000000000000000000000000000000000000000000000000000000',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x40a6466913b4792a731aa0c7ee373a4aa8accbe1fa9f714ca0f29316a8219528',
                    '0x83bacc1cdaa6a6d4c8935e5f993c65e9dcd84e87e5e2e9b0fa667860646ab77e',
                    '0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672',
                    '0x3dfe8762f00602ee0d5a9314118e0fd355a8faccf94acf34e60d39d4b7a371b2',
                    '0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30',
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    '0x3049b83a35d021acb1ff145b4551f07d297c16bc9f743674e5375cebdeb10866',
                    '0x00b068b1f2e5f6a90116aad75740ba8e98647434297425989ba565b81881ac04',
                    '0xc024566a00000000000000000000000000000000000000000000000000000000',
                    '0xffffffffff3f0000000000000000000000000000000000000000000000000000',
                    '0xb2f812271e9e9fb65dfb180abc303257fb399e6f7abd7d34bcaae366638eafe0',
                    '0x1bcc86e680437567fc58d387d364b86e1e5df33648d7c000cfbb5d0b11e81bcb',
                    '0x2e51e71f56dcc4976c11d43e9b8adb3acb89ac39b0769d6b6bbf6672eb70ec21',
                ],
            };

            assert.equal(
                await verifier.verifyNextWithdrawalIndex(slotTimestamp, slot, withdrawalSlot, proof),
                true,
            );
            assert.equal(
                await verifier.verifyNextWithdrawalIndex(slotTimestamp, slot, withdrawalSlot, {
                    ...proof,
                    nextWithdrawalIndex: proof.nextWithdrawalIndex + 1n,
                }),
                false,
            );
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
                verifierHarness.verifyWithdrawalProof(tooOldSlotTimestamp, tooOldSlot, tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, tooOldWithdrawalProof),
                'Accepted pre-electra proof',
                'Invalid proof',
            );
            await shouldRevert(
                verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, tooNewProof),
                'Accepted too recent proof',
                'Invalid slot for proof',
            );
            await shouldRevert(
                verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, invalidWitnessLengthProof),
                'Accepted invalid witness length',
                'Invalid witness length',
            );
            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, invalidProof), false);
            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, incorrectAmountProof), false);
            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, correctProof), true);
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

            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, correctProof), true);
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

            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, {
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

            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum: 0,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify pre-Gloas withdrawal with a post-Gloas proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 256n],
                beaconRoots.target,
            );

            const slot = 300n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0xd10cb38dad5cd1d8b9b8f7ada9d9d197898d8f86fd40497984327e3fa98cfcba';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on devnet-7 kurtosis instance
            const proof = {
                withdrawalSlot: 128n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 0n,
                    validatorIndex: 128n,
                    withdrawalCredentials: '0xac0dbd462b0cbe487238214d06f62c6837839693',
                    amountInGwei: 1000000000n,
                },
                witnesses: [
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                    "0xdb56114e00fdd4c1f85c892bf35ac9a89289aaecb1ebd0a96cde606a748b5d71",
                    "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                    "0x0100000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x035ebc957426e55226dcb5eaa8f9eb22594a25b2c1d49f6088e05eb985c17cf8",
                    "0x2c3f2243d8a2af7c5406d2cd1c57534b3eeb84e68751cd028a2ef4e55cfc49bc",
                    "0x835150442826c323cfac0bc623de04fbb75737d4ceb13cdf689e3436d4a13ecd",
                    "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                    "0xec140f63f5055d9a1ee1d9657832438a710c143a823ecabebaab174cd09372b4",
                    "0xb46f0c01805fe212e15907981b757e6c496b0cb06664224655613dcec82505bb",
                    "0x6dd3b9955d892d92338b19976fd07084bfe88a76c3063482b7f30ee60feb2a58",
                    "0x5f0787b13543bf3b340ee068698e8a7d24161fada100844c8b80edfb8b98a0c2",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                    "0x02546a81e3dc8c6d3672bd34ebc4006ba96806806b5447f3c94abf01b6864212",
                    "0x3a48e57684c4f48a6013fb0837ba89201f42a7c2d64b08edcf0ff888204ad722",
                    "0xca7cd63bd091beafc3c8d5876368841e907d947f16426bd69abac0fc1a85c71a",
                    "0x805ab8a3dcf57626b3df95cafc1fa848ab6f4dcaaee12ba8ff787c51f1d14b0e",
                    "0x23d035bf9529541f165b9f86473a4894f86f9fef3d4a19131f1d1539ace7896c",
                    "0x6c126a3b729054f4c3affb77f114032dd109e925fdf20f54728792f71260188c",
                    "0xc385f6e949f0fedbee0b8bf7c6011215e9d195ff63ca1db868dcaf4dce883ac7",
                    "0x03b621b6a52efcf8c508ea9faae873bc200e66cad30c0dca97895a79d6df1400",
                    "0x74aa814931fffa8e3173b69ea3266297272b5436d96a450ee0b364f1687d4b73",
                    "0xde064c568e0f53107c2b0233080e318b169d4b2fe6836c9a77ce8b77b8386b62",
                    "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                    "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                    "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                    "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                    "0x7d7899e3c03ae02aa584cf905e875e173ff5e1f9c30aa97f00b13b93b3461b61",
                    "0x24b7c56b04bb30d26e5838f184f6a878c7ea754b0cfe73f60a38f2ecc8f37058",
                    "0x4c7ef69b8f7fe24b8464b2169320610e36c162b8e2dcff25f60d613eeefcf443",
                    "0x7528f941885b71114aa61c9a0235e8dd196738553a7caed5cb04ef41581c9748",
                    "0x23f09d55890add74d067eea488c2a67e8ade98e6bb8be681cb674f38e979d7e4",
                    "0xb1f09ee110200c93916b51d51c657861c2bf66d299e7577884939f4e45c13e33",
                    "0x3cc2726a00000000000000000000000000000000000000000000000000000000",
                    "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                    "0xa88d28583c6e78b0b58455f57fc62ff3923ee8fe94307c5c86e781d4a03818ef",
                    "0x29b160f50fb5e0258229f9bec8f92a685bb8d3253a51b714f0799036010bc83a",
                    "0x214f86b5b32b1133e459a3e38fff2dc504aa5534e800dfdffca53d5b5c55c7e8"
                ],
            };

            assert.equal(await verifier.verifyWithdrawalProof(slotTimestamp, slot, proof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify a historical pre-Gloas withdrawal with a post-Gloas proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 256n],
                beaconRoots.target,
            );

            const slot = 16335n;
            const slotTimestamp = slot * 12n;
            const blockRoot = '0x9797704f0bac79644f7960519e52c8a62d47b94d365b060930fb0f29148ddc4d';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Proof generated from real beacon state data on devnet-7 kurtosis instance
            const proof = {
                withdrawalSlot: 128n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 0n,
                    validatorIndex: 128n,
                    withdrawalCredentials: '0xac0dbd462b0cbe487238214d06f62c6837839693',
                    amountInGwei: 1000000000n,
                },
                witnesses: [
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                    "0xdb56114e00fdd4c1f85c892bf35ac9a89289aaecb1ebd0a96cde606a748b5d71",
                    "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                    "0x0100000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x035ebc957426e55226dcb5eaa8f9eb22594a25b2c1d49f6088e05eb985c17cf8",
                    "0x2c3f2243d8a2af7c5406d2cd1c57534b3eeb84e68751cd028a2ef4e55cfc49bc",
                    "0x835150442826c323cfac0bc623de04fbb75737d4ceb13cdf689e3436d4a13ecd",
                    "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                    "0xec140f63f5055d9a1ee1d9657832438a710c143a823ecabebaab174cd09372b4",
                    "0xb46f0c01805fe212e15907981b757e6c496b0cb06664224655613dcec82505bb",
                    "0x6dd3b9955d892d92338b19976fd07084bfe88a76c3063482b7f30ee60feb2a58",
                    "0x5f0787b13543bf3b340ee068698e8a7d24161fada100844c8b80edfb8b98a0c2",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                    "0x02546a81e3dc8c6d3672bd34ebc4006ba96806806b5447f3c94abf01b6864212",
                    "0x3a48e57684c4f48a6013fb0837ba89201f42a7c2d64b08edcf0ff888204ad722",
                    "0xca7cd63bd091beafc3c8d5876368841e907d947f16426bd69abac0fc1a85c71a",
                    "0x805ab8a3dcf57626b3df95cafc1fa848ab6f4dcaaee12ba8ff787c51f1d14b0e",
                    "0x23d035bf9529541f165b9f86473a4894f86f9fef3d4a19131f1d1539ace7896c",
                    "0x6c126a3b729054f4c3affb77f114032dd109e925fdf20f54728792f71260188c",
                    "0xc385f6e949f0fedbee0b8bf7c6011215e9d195ff63ca1db868dcaf4dce883ac7",
                    "0x03b621b6a52efcf8c508ea9faae873bc200e66cad30c0dca97895a79d6df1400",
                    "0x74aa814931fffa8e3173b69ea3266297272b5436d96a450ee0b364f1687d4b73",
                    "0xbce837e825a426bef1fa37fb9e17f5d3c7ab13c1ea666867c59604472fe577a4",
                    "0xe09e5a84014bc0b13db5942e37cb6afb07c7776287d4fc8a4941085394422411",
                    "0xaa68d10818432e5044c39777f3e5861139e7de24a3d4b80da17890b32e235f4f",
                    "0x19e2bfe7df34b8d9ec86b2c4252a123e41c0f54d5a9827e34b4933ac5b9e9fe4",
                    "0x0f928b54dd6c484fb97c5dbf1e769885a0f7e13024dff2450645c86b89ccc8c3",
                    "0x6690f3dd06a8e9eb2e84be3f99ea3f456cb6c7a81d65e244ebd1d302866b5dec",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                    "0xdb56114e00fdd4c1f85c892bf35ac9a89289aaecb1ebd0a96cde606a748b5d71",
                    "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                    "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                    "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                    "0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1",
                    "0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c",
                    "0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193",
                    "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                    "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                    "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                    "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                    "0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e",
                    "0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784",
                    "0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb",
                    "0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb",
                    "0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab",
                    "0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4",
                    "0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f",
                    "0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa",
                    "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                    "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                    "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                    "0x0100000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x43cc50c4aac18ddc2a979877e061f61ae0cb5297f3632aaff983b20edb935f73",
                    "0x470f583a6223a7bebf3b229aa4d86cb9ff99bf1f823e90188b0dc429ae5aa33d",
                    "0xb580979a0a2ec68f5ace0f3ca5c9617d54d2269ddc4229935a983f32eac4ee46",
                    "0x488b540d3147c1afa154efdb7ad06b5fdb19abdc64893f9a2462b47c9277ca48",
                    "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x2e24061d69d4cd8df89ea57faf0951834790286902956c75ed38def0eaaf47fd",
                    "0x101bf9d0f957e385e9036409ff35b25b934c9291c235eb01a0d0b5c09661273a",
                    "0x3cc2726a00000000000000000000000000000000000000000000000000000000",
                    "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                    "0x334ae2ebcf9073c9e5201883b963198983a69b06e4afa188e8aa9e1e2dac0436",
                    "0x3605a9246de6cdac8d660e1195c5c8ae75bd62c2da7547d99ae7ff64a02a5d58",
                    "0x5201d7b825f593f2dae3e1ce7a0e9e9b236fb83768a57a5aeed6c896945d067b"
                ],
            };

            assert.equal(await verifier.verifyWithdrawalProof(slotTimestamp, slot, proof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify versioned pre-Gloas proof bundles'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 14000000n],
                beaconRoots.target,
            );

            const slot = 13999999n;
            const withdrawalSlot = slot - 1n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const validatorIndex = 50n;
            const withdrawalNum = 0n;
            const withdrawal = {
                index: 91000000n,
                validatorIndex,
                withdrawalCredentials: '0xf97e180c050e5ab072211ad2c213eb5aee4df134',
                amountInGwei: 32000000000n,
            };
            const validator = {
                pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                effectiveBalance: 32000000000n,
                slashed: false,
                activationEligibilityEpoch: 0n,
                activationEpoch: 0n,
                exitEpoch: withdrawalSlot / 32n,
                withdrawableEpoch: withdrawalSlot / 32n,
            };

            const slotPath = '011' + '000010';
            const validatorPath = '011' + '001011' + validatorIndex.toString(2).padStart(41, '0');
            const withdrawalPath = '011'
                + '000101'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '100'
                + '1001'
                + '01110'
                + withdrawalNum.toString(2).padStart(5, '0');
            const proofs = makeMultiProofs([
                { path: slotPath, leaf: toLittleEndian(slot) },
                { path: validatorPath, leaf: merkleiseValidator(validator) },
                { path: withdrawalPath, leaf: merkleiseWithdrawal(withdrawal) },
            ]);
            await beaconRoots.setBlockRoot(slotTimestamp, proofs.root);

            const withdrawalProof = [
                withdrawalSlot,
                withdrawalNum,
                [withdrawal.index, withdrawal.validatorIndex, withdrawal.withdrawalCredentials, withdrawal.amountInGwei],
                proofs.witnesses.get(withdrawalPath),
            ];
            const validatorProof = [
                validatorIndex,
                [
                    validator.pubkey,
                    validator.withdrawalCredentials,
                    validator.effectiveBalance,
                    validator.slashed,
                    validator.activationEligibilityEpoch,
                    validator.activationEpoch,
                    validator.exitEpoch,
                    validator.withdrawableEpoch,
                ],
                proofs.witnesses.get(validatorPath),
            ];
            const slotProof = [slot, proofs.witnesses.get(slotPath)];
            const withdrawalProofType = 'tuple(uint64,uint16,tuple(uint64,uint64,bytes20,uint64),bytes32[])';
            const validatorProofType = 'tuple(uint40,tuple(bytes,bytes32,uint64,bool,uint64,uint64,uint64,uint64),bytes32[])';
            const slotProofType = 'tuple(uint64,bytes32[])';
            const abiCoder = ethers.AbiCoder.defaultAbiCoder();

            const validatorProofData = abiCoder.encode(
                [`tuple(${validatorProofType},${slotProofType})`],
                [[validatorProof, slotProof]],
            );
            const verifiedValidator = await verifier.verifyValidator(slotTimestamp, 1, validatorProofData);
            assert.equal(verifiedValidator.validatorIndex, validatorIndex);
            assert.equal(verifiedValidator.slot, slot);

            const finalBalanceProofData = abiCoder.encode(
                [`tuple(${withdrawalProofType},${validatorProofType},${slotProofType})`],
                [[withdrawalProof, validatorProof, slotProof]],
            );
            const verifiedFinalBalance = await verifier.verifyFinalBalance(slotTimestamp, 1, finalBalanceProofData);
            assert.equal(verifiedFinalBalance.amountInGwei, withdrawal.amountInGwei);
            assert.equal(verifiedFinalBalance.withdrawalEpoch, withdrawalSlot / 32n);

            await shouldRevert(
                verifier.verifyValidator(slotTimestamp, 2, '0x'),
                'Accepted unknown validator proof version',
                'Unsupported proof version',
            );
            await shouldRevert(
                verifier.verifyFinalBalance(slotTimestamp, 3, '0x'),
                'Accepted unknown final balance proof version',
                'Unsupported proof version',
            );
        });

        it(printTitle('BeaconStateVerifier', 'Can verify post-Gloas expected withdrawal proof'), async () => {
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
            // payload_expected_withdrawals
            const path = '011'
                + '01100001'
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + '01110010111'
                + '01010';
            const witnesses = makeWitnesses(path.length);
            const blockRoot = restoreRoot(merkleiseWithdrawal(withdrawal), path, witnesses);
            await beaconStateVerifier.setBlockRoot(slotTimestamp, blockRoot);

            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify versioned validator and final balance with real post-Gloas proof bundle'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slotTimestamp = 313360n * 12n;
            const blockRoot = '0x7c195bfea7b43b43f3ddaa8953a6a341358a79b95757c42fbdb4b021f20175c8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Complete proof bundle generated from real beacon state data on glamsterdam-devnet-7
            const proofBundle = {
                "withdrawalProof": {
                    "withdrawalSlot": 313349,
                    "withdrawalNum": 4,
                    "withdrawal": {
                        "index": 363542,
                        "validatorIndex": 1649,
                        "withdrawalCredentials": "0xf97e180c050e5ab072211ad2c213eb5aee4df134",
                        "amountInGwei": 1032433042920
                    },
                    "witnesses": [
                        "0xb899cb50d4eb0f56a816bfe03d133f3a389d73a1c2b8105054aeaa05cfa0b9c9",
                        "0xa60eb3cb724e9c6dfca4cf7de3ba74fd5d2c6d01cb6cb58bad083a4ff64b3e7d",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0xd50e76a7368ba7257de87ed40c6aece15047cfe42358faf1c6a8508493c60eed",
                        "0x0500000000000000000000000000000000000000000000000000000000000000",
                        "0xaf1ebb29b79ab154fb4794f8632f3fd0e195b3324f23ab9d7f6f3b685f1f1a99",
                        "0xa63e6838b39ac9c2e5db6a09198c48c3fe74d98d88207494cf394a1e74598d75",
                        "0xb75fd7ae322fe34ad0dcc89a29bd3ceb2c0c6dfae19aa35773bf0410db635be9",
                        "0x5cbbd59afb973029cb902c22a7e3d61f8aebb2af4b22c465c56645088958b055",
                        "0xf207f2d8599c34b7d6c84a17d0c02751135d1a36d8c5206f25364f926944b56a",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0xf60f403a46e58d2b5cb945944290c61f03dbd79b4e1a114d2a44bb8a4b32019d",
                        "0xb03684545db7a72d7252c193565517118c10db52bf5ce5ad2a821d42dee6048c",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x40ab81a1b19660cb8fb8f6d363698a76128262d97cf6dbf9f7ab5a3ee0ea5a0f",
                        "0x3b6ba248a2c59cd93a8bb562d32eca83d553b7012849b48cb21e4f1f229bfb4d",
                        "0xfb39f33ae1cf937e032b09739551fbad9a93a29516296c32eefec8274133de82",
                        "0x0b5a91ef1aaaf65f67de4044dc38def386bab613a6d51d5e7064cffa21e8137c",
                        "0xc458c36bfb4dbbbe7ad67701f3d1c876ef282bc1a4d7091354e48fd45bdd1fb7",
                        "0x32ff092b0d808ec09a35d5cb20ad8249bc8558b07ca5582e193ae827d86c13a4",
                        "0xb386a2a51e2c71bd466d8bfb0aeba65886b4d30fb27933e0cf0c854d43e462e5",
                        "0x734b87e44cd202789fb03d1aef3ea111cef4db1b4bfcd248ae0731e0293156e5",
                        "0xde324852910c90aa74d089627db0fef08abe6837dec03c56c0e3e4ebeac5fe72",
                        "0xf0bdd1d56291d3c4a7a517a14f50613364d524023b32aef37cec4ee3367bc3b3",
                        "0x48e3541728efa28608bdc27cb716c643007a25a40a97ae0dac6c96e69c526be2",
                        "0xa8c051225cc5f1d06ea1c409887ff499008a167f67395fa483929a54e5f371a2",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x54e0b27600e9ecaab0d58258c45c14943f24d039f8be63ec417bb5685f7cf889",
                        "0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae",
                        "0xe286ed7fb9a2aa5b32c73c0e556978883493b6b07f7b57645ac1c7fe841de15a",
                        "0xf0df3bc2d4d97350c072c644ff8ac19d30b633d5751731af97ffe3936ff5d829",
                        "0x26e84fbd54bff93166cce02c295e4dccea40e177bef49f7a678e7acf0e35f462",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "validatorProof": {
                    "validatorIndex": 1649,
                    "validator": {
                        "pubkey": "0x80ea968111f8b756e5e391fef1939f8977a23fbf5ba0342189aeb244e814d9344ff145dd73d938fa8f7afd5931c056ec",
                        "withdrawalCredentials": "0x020000000000000000000000f97e180c050e5ab072211ad2c213eb5aee4df134",
                        "effectiveBalance": 1032000000000,
                        "slashed": false,
                        "activationEligibilityEpoch": 0,
                        "activationEpoch": 0,
                        "exitEpoch": 9536,
                        "withdrawableEpoch": 9792
                    },
                    "witnesses": [
                        "0xc2a5995326728f645c667c6a9318a2dee5e6ba0cfc760d5d586554e9fac1fa60",
                        "0x0a43c4cbf005ae1d533b8b46d0b75e4835a2f16c81e6524ed6a9d9460f8be1d0",
                        "0x3672ccc161ae87646292c652c8da1f865770b679d7e0e2813dec81f4b146ff8a",
                        "0xdbe33d85a25a1b36b0ee9c822e1d90de5714db52145099902668d2e030e5a460",
                        "0x8f73ea900891b6b1159bd2f2941305282ee4ff32347721f1c2dfc4d82d6ee555",
                        "0xc46dde007dba5dc905514eb97025bb462f43ab023deaa79ade6fadce96d11a24",
                        "0x515efe40cecd7de1194c72d59abe33d4f68a7fa66b482353bd6866db3c1a87b7",
                        "0x8b6d2c5d77793d4ed17bf00b8a1d0a45d4f2943d4fd424db69ccdbb018e7378b",
                        "0xeabc6597379a745ebad0a46c51e77c8f5ccec5522b13ea866b102969129ddd2a",
                        "0xc6da13c7276bae098cab517d725928d1a9c330fa88ebd49f4bb9f25db2effd94",
                        "0xf46cbe77ef45cc51a062c377f2e5a50770db6d3a747259a97bac3fcba29d0669",
                        "0xaf2bacbb18e8e6b6793450d0b581e126632eb72ac950bc13edf2f31edb342989",
                        "0x67e9c8bf87e463903ae89401b397eb334396c9eedaed3aa6708bc34250414fe7",
                        "0x22eabc83d5cd6ac5fd7808202a88ba750ee652e2bf0b270c113ce97c9028ddac",
                        "0x9d9fbb903e80288d273b91c35321dff5db0ee2542b0632aa5b122c80636a73fa",
                        "0x6063d7ede918bf5c0d1b2380744d68b73b07f94f5ca848344e206acab12a5ae8",
                        "0x396ca5c785751f4d85d42f54d6d53a378178021bbacb278511b61dfcd4a2a3f4",
                        "0x79da9845457a55211c9cbbca599154d874b4414dc65340aa2bc081da0852ca00",
                        "0x1832df13c6cfe44ca0b188aa3600f7d1402bb7e1f9fb97d32ecec23b82656566",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0x6b369dc0f3003e4f55d0d9173ae9ab6b1705ba942229e159f5b5f3f1dcb3d827",
                        "0x109e42999c9683ab41af2474d5a45eaad36052ce14546a6c215e1beda6d8b149",
                        "0x117fbf9b48bba7e6b0f26730ac341a007956ec36326b1d4f751c9a8317e9db07",
                        "0xf0df3bc2d4d97350c072c644ff8ac19d30b633d5751731af97ffe3936ff5d829",
                        "0x26e84fbd54bff93166cce02c295e4dccea40e177bef49f7a678e7acf0e35f462",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "slotProof": {
                    "slot": 313360,
                    "witnesses": [
                        "0x8f9a8573a44269574a9a9c2d932243aaeeb9b88cd1ef1b83b3bea97f06d3bafe",
                        "0x9057b5a8e333093db03340c482567530d288bb28f3f09faea31701e3f6614a25",
                        "0x04556de8f1ec1defebbd480facfdc4249db9511dce7c4c5d247ae319f17bfc7b",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "previousNextWithdrawalIndexProof": {
                    "nextWithdrawalIndex": 363538,
                    "witnesses": [
                        "0x0ba6070000000000000000000000000000000000000000000000000000000000",
                        "0x9e4ae32cf15a1d1ad9f8cffa20a4c7c10d3c3179c47f538baa36d087e4d40f11",
                        "0x8bc077db8e85f164322e0b29b8b6616b0b39ddfe0c2611e5a1fb683e6f4adda2",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0x186445866a04118b7b71017bf9aefa9e0e3b3b4a01392ed6982ed8c37dacf271",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0xedde0f778df0a51281050e72183ce37d24614de02b51acf378d454d2aeb076d9",
                        "0x52d7c81186eb59a032886969b597cf5ff8b3f9dd42825ea6f26c4899c7b835ad",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x33aeef9089631b9c09ba140e25ba1f85e14955cde71b678e97250afcdfcfbb05",
                        "0x3b6ba248a2c59cd93a8bb562d32eca83d553b7012849b48cb21e4f1f229bfb4d",
                        "0xfb39f33ae1cf937e032b09739551fbad9a93a29516296c32eefec8274133de82",
                        "0x0b5a91ef1aaaf65f67de4044dc38def386bab613a6d51d5e7064cffa21e8137c",
                        "0xc458c36bfb4dbbbe7ad67701f3d1c876ef282bc1a4d7091354e48fd45bdd1fb7",
                        "0x32ff092b0d808ec09a35d5cb20ad8249bc8558b07ca5582e193ae827d86c13a4",
                        "0xb386a2a51e2c71bd466d8bfb0aeba65886b4d30fb27933e0cf0c854d43e462e5",
                        "0x734b87e44cd202789fb03d1aef3ea111cef4db1b4bfcd248ae0731e0293156e5",
                        "0xde324852910c90aa74d089627db0fef08abe6837dec03c56c0e3e4ebeac5fe72",
                        "0xf0bdd1d56291d3c4a7a517a14f50613364d524023b32aef37cec4ee3367bc3b3",
                        "0x48e3541728efa28608bdc27cb716c643007a25a40a97ae0dac6c96e69c526be2",
                        "0xa8c051225cc5f1d06ea1c409887ff499008a167f67395fa483929a54e5f371a2",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x54e0b27600e9ecaab0d58258c45c14943f24d039f8be63ec417bb5685f7cf889",
                        "0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae",
                        "0xe286ed7fb9a2aa5b32c73c0e556978883493b6b07f7b57645ac1c7fe841de15a",
                        "0xf0df3bc2d4d97350c072c644ff8ac19d30b633d5751731af97ffe3936ff5d829",
                        "0x26e84fbd54bff93166cce02c295e4dccea40e177bef49f7a678e7acf0e35f462",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "validatorBalanceProof": {
                    "balanceChunk": "0x4cf6fc6ef0000000000000000000000001971052f0000000d1885a64f0000000",
                    "witnesses": [
                        "0x973ea85af0000000a09e4363f0000000bb17354ef0000000ec302475f0000000",
                        "0x797d6b0cfd9dd90c26f59dc094e6895e864cf608bdddfe248d209f9370ea8b15",
                        "0x506c56a94f47d02b0ae37b3f11092fc099f41c483f033a854de0e2ac40e0245a",
                        "0xabedb1d396780b42ce4c6a00c3294f830c81878ec7ddc12f75419f6b6a877dc8",
                        "0x7043de93318924259f69a88f830fa1d8be3df5e4117cb27e9ccf90a08bcb77ba",
                        "0xf8555011c87f73fd765dc5926f0d52ea7eb168ece6d3569144917a4bb5d31fd5",
                        "0x484289b568fd579c43be96de5036c7346fc0a9326fcad1ff1dd8d72359ab6982",
                        "0x64fdbc570f50812747a070981eb1b99abc1c02e9e6da34ce52f95abb7ef60335",
                        "0xed0ad2b3c6422678a6be9720cbf5f5ce583ddbb847ec0df36de9d6c04a0c19cb",
                        "0x8cc6f2a89006df1efb533f8f89d9e90a199b3e77140762d8724de3bd591028ba",
                        "0x97f8d31ce36ec0034edbe0ba9ce9525159d5a7b4e252b91bf9d8c0afda1aa11c",
                        "0x8fdb3dac722069655a1d968a019eda31d647812cba65c6f4a66e57c8d4f58546",
                        "0xee39baa358164f88e63e87a0672d0568bf7f245593f961bdec1214af16c74b2e",
                        "0x3c541ba254dea232178147cf8188d1aed2ed39cffbc187c0a0725ad9f0a4ecb2",
                        "0x1742dbcd41228d0566d59698cef432a761096679f303fc4210e905065deaa32b",
                        "0x000050d6dc01000000000000000000009b1c50d6dc01000041fe904ef0000000",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0x9518d4f026d37e206fecb5a4cb78e3d0ac89fd6dcae92fb5f5d3412b6e36da6a",
                        "0xe106302aa6523be5346c3f416efbc1e085281f954b56714fa4b6b5aba6efe149",
                        "0x11f17fa1c5a2e6722b775a94874e5e41308347386c6351ad307a3955d057c147",
                        "0x9895c396472ef3670186b6903d81056e6e6418db885d7f6a48ffc8b55eb2bae1",
                        "0xf4d8dbac54e45ef8af9cf9f5d3d71fee9d3e33abc9f5cca9a565bc72d8a2372d",
                        "0xb03684545db7a72d7252c193565517118c10db52bf5ce5ad2a821d42dee6048c",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x40ab81a1b19660cb8fb8f6d363698a76128262d97cf6dbf9f7ab5a3ee0ea5a0f",
                        "0x3b6ba248a2c59cd93a8bb562d32eca83d553b7012849b48cb21e4f1f229bfb4d",
                        "0xfb39f33ae1cf937e032b09739551fbad9a93a29516296c32eefec8274133de82",
                        "0x0b5a91ef1aaaf65f67de4044dc38def386bab613a6d51d5e7064cffa21e8137c",
                        "0xc458c36bfb4dbbbe7ad67701f3d1c876ef282bc1a4d7091354e48fd45bdd1fb7",
                        "0x32ff092b0d808ec09a35d5cb20ad8249bc8558b07ca5582e193ae827d86c13a4",
                        "0xb386a2a51e2c71bd466d8bfb0aeba65886b4d30fb27933e0cf0c854d43e462e5",
                        "0x734b87e44cd202789fb03d1aef3ea111cef4db1b4bfcd248ae0731e0293156e5",
                        "0xde324852910c90aa74d089627db0fef08abe6837dec03c56c0e3e4ebeac5fe72",
                        "0xf0bdd1d56291d3c4a7a517a14f50613364d524023b32aef37cec4ee3367bc3b3",
                        "0x48e3541728efa28608bdc27cb716c643007a25a40a97ae0dac6c96e69c526be2",
                        "0xa8c051225cc5f1d06ea1c409887ff499008a167f67395fa483929a54e5f371a2",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x54e0b27600e9ecaab0d58258c45c14943f24d039f8be63ec417bb5685f7cf889",
                        "0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae",
                        "0xe286ed7fb9a2aa5b32c73c0e556978883493b6b07f7b57645ac1c7fe841de15a",
                        "0xf0df3bc2d4d97350c072c644ff8ac19d30b633d5751731af97ffe3936ff5d829",
                        "0x26e84fbd54bff93166cce02c295e4dccea40e177bef49f7a678e7acf0e35f462",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                }
            };
            const validatorProofData = encodeValidatorProofV1(
                proofBundle.validatorProof,
                proofBundle.slotProof,
            );
            const verifiedValidator = await verifier.verifyValidator(slotTimestamp, 1, validatorProofData);
            const expectedValidator = proofBundle.validatorProof.validator;
            assert.equal(verifiedValidator.validatorIndex, BigInt(proofBundle.validatorProof.validatorIndex));
            assert.equal(verifiedValidator.slot, BigInt(proofBundle.slotProof.slot));
            assert.equal(verifiedValidator.validator.pubkey, expectedValidator.pubkey);
            assert.equal(verifiedValidator.validator.withdrawalCredentials, expectedValidator.withdrawalCredentials);
            assert.equal(verifiedValidator.validator.effectiveBalance, BigInt(expectedValidator.effectiveBalance));
            assert.equal(verifiedValidator.validator.slashed, expectedValidator.slashed);
            assert.equal(verifiedValidator.validator.activationEligibilityEpoch, BigInt(expectedValidator.activationEligibilityEpoch));
            assert.equal(verifiedValidator.validator.activationEpoch, BigInt(expectedValidator.activationEpoch));
            assert.equal(verifiedValidator.validator.exitEpoch, BigInt(expectedValidator.exitEpoch));
            assert.equal(verifiedValidator.validator.withdrawableEpoch, BigInt(expectedValidator.withdrawableEpoch));

            const proofData = encodeFinalBalanceProofV2(
                proofBundle.withdrawalProof,
                proofBundle.validatorProof,
                proofBundle.slotProof,
                proofBundle.previousNextWithdrawalIndexProof,
                proofBundle.validatorBalanceProof,
            );

            const verified = await verifier.verifyFinalBalance(slotTimestamp, 2, proofData);
            assert.equal(verified.validatorPubkeyHash, ethers.keccak256(proofBundle.validatorProof.validator.pubkey));
            assert.equal(verified.withdrawalCredentials, proofBundle.validatorProof.validator.withdrawalCredentials);
            assert.equal(verified.amountInGwei, BigInt(proofBundle.withdrawalProof.withdrawal.amountInGwei));
            assert.equal(verified.withdrawalEpoch, 9792n);
            assert.equal(verified.recentEpoch, 9792n);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify final balance with real historical post-Gloas proof bundle'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slotTimestamp = 313360n * 12n;
            const blockRoot = '0x7c195bfea7b43b43f3ddaa8953a6a341358a79b95757c42fbdb4b021f20175c8';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // Complete historical proof bundle generated from real beacon state data on glamsterdam-devnet-7
            const proofBundle = {
                "withdrawalProof": {
                    "withdrawalSlot": 303311,
                    "withdrawalNum": 3,
                    "withdrawal": {
                        "index": 356356,
                        "validatorIndex": 415,
                        "withdrawalCredentials": "0xf97e180c050e5ab072211ad2c213eb5aee4df134",
                        "amountInGwei": 1032784338321
                    },
                    "witnesses": [
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x5d02307d49f87cf5d397afacb00f2bf28c68ab8f91d30bc13ef813265e666b6d",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x3d1270648c4e2ff66aae0a3b228aa2c8f9c5e7259d8d5df9b30b620ffd4c52bb",
                        "0x0400000000000000000000000000000000000000000000000000000000000000",
                        "0x156d633147a49d8a0719c7b31769d6268f3fad283251328a10556159c1dd5481",
                        "0xa55cfb1d72b46df5c3e329d8b4f3bc84968e682655c784bc7b9576f1acdb43e0",
                        "0x2059352345ea5091fc40cc3477a906328abaa91336f1b64b3add6b613c3ba786",
                        "0xd161fd73c3ccfaae92e672d8bb0462df656f0a36b6f546083bf81144fc857737",
                        "0x4098454302cb6442df06f9764cc3c9b0fa501bf98c724b8402c1d5aa35e8bc9f",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x6eef7c1a22363186acbd2ce3213eb7cba4effde6521bec42c007e39256786afd",
                        "0x8ecb24f8b922efce255d0f380e3f12e6c78c33734048c70fb1328efacc5f29fd",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0xdd99115ce0ea771432dd3f2d6a78c68a72a4503adcacf0073cbefd7d43c05330",
                        "0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6",
                        "0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82",
                        "0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009",
                        "0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135",
                        "0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415",
                        "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                        "0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d",
                        "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                        "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                        "0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee",
                        "0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1",
                        "0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c",
                        "0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193",
                        "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                        "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                        "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                        "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                        "0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e",
                        "0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784",
                        "0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb",
                        "0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb",
                        "0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab",
                        "0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4",
                        "0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f",
                        "0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa",
                        "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                        "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                        "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                        "0x2600000000000000000000000000000000000000000000000000000000000000",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x2a4918cae204e346edce5e5217b8f599b8828a318f977fe1ce391f6b61561d6f",
                        "0xbb96fc581ca82f7bb41d3c063efe9bcf7433ff920717c737e8c040fd226de5e4",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0xbd4d202e6c042537e14dd66795af13b197c506911140787ad5e0f04d89a3051a",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x223c750bc1316859fef9208c0eba8602f047a597b625c84732ca945969f07c44",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "validatorProof": {
                    "validatorIndex": 415,
                    "validator": {
                        "pubkey": "0x8182ea51511d54c9675c622810a623c14691d048f2212b6266c2d6e23f59d0b7aac0be4633f577c7092bbbdff5ec10f3",
                        "withdrawalCredentials": "0x020000000000000000000000f97e180c050e5ab072211ad2c213eb5aee4df134",
                        "effectiveBalance": 0,
                        "slashed": false,
                        "activationEligibilityEpoch": 0,
                        "activationEpoch": 0,
                        "exitEpoch": 9222,
                        "withdrawableEpoch": 9478
                    },
                    "witnesses": [
                        "0xdf4509bc3ec6a246a862079b27ece2f9f13e570cd7e22c3d294e409c61760ebe",
                        "0xf7b37cc9033932a4fab4f09142340030f5193440c6f72cdbff7e2494b45cea48",
                        "0x77597c024db6c7e9fa26e62b39882b3ab0e89c5ef8b6b856b9af1a19af0b870c",
                        "0x09f6861cd5666cb031717c70395b3b369cf6620969f5491e46fdc6785bfff91e",
                        "0x91ab84269f8a25ff87e9a04f6694fb06bdf667e5c80a95a0da08a9a3c00ad4a0",
                        "0x87eacc031a03d564c48ddd277ef659ca77ffb883d25a26a40e245ddd23f6fe3a",
                        "0x1c517aa2ce559a8f1fa667d55e82228dd6b43a3b5a6d3420c2454e212288b0f5",
                        "0x02c001fe2664fbbb781d48339728b9885d2c7f2420c7ef1720c41e79ca3f6066",
                        "0x9df6955c72542389729120f2ee11c13444d02c9c7f4e56d6d531b22b07eb8898",
                        "0x1efffbe75c69b704938a04556985d95debcfac1b4efadee6438d21860a705d9e",
                        "0xf42685faa15098492b089178a28e0ef6256949d9f632b699f07fbda9376f0b92",
                        "0x9d9fbb903e80288d273b91c35321dff5db0ee2542b0632aa5b122c80636a73fa",
                        "0x6063d7ede918bf5c0d1b2380744d68b73b07f94f5ca848344e206acab12a5ae8",
                        "0x396ca5c785751f4d85d42f54d6d53a378178021bbacb278511b61dfcd4a2a3f4",
                        "0x79da9845457a55211c9cbbca599154d874b4414dc65340aa2bc081da0852ca00",
                        "0x1832df13c6cfe44ca0b188aa3600f7d1402bb7e1f9fb97d32ecec23b82656566",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0x6b369dc0f3003e4f55d0d9173ae9ab6b1705ba942229e159f5b5f3f1dcb3d827",
                        "0x109e42999c9683ab41af2474d5a45eaad36052ce14546a6c215e1beda6d8b149",
                        "0x117fbf9b48bba7e6b0f26730ac341a007956ec36326b1d4f751c9a8317e9db07",
                        "0xf0df3bc2d4d97350c072c644ff8ac19d30b633d5751731af97ffe3936ff5d829",
                        "0x26e84fbd54bff93166cce02c295e4dccea40e177bef49f7a678e7acf0e35f462",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "slotProof": {
                    "slot": 313360,
                    "witnesses": [
                        "0x8f9a8573a44269574a9a9c2d932243aaeeb9b88cd1ef1b83b3bea97f06d3bafe",
                        "0x9057b5a8e333093db03340c482567530d288bb28f3f09faea31701e3f6614a25",
                        "0x04556de8f1ec1defebbd480facfdc4249db9511dce7c4c5d247ae319f17bfc7b",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "previousNextWithdrawalIndexProof": {
                    "nextWithdrawalIndex": 356353,
                    "witnesses": [
                        "0x3f71070000000000000000000000000000000000000000000000000000000000",
                        "0x9440ec6f27629619b1cedf11d09a62b7c216027d7af6ba30c7e5d845ed43acd0",
                        "0xb19ad0896be9709b24511d7c04ebf6a793114fa71a80f9e62821b8a3ad374e90",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0xae6c089c75b8f8a0046b943ce1627e474154891a78d48ddd7f2d03e5a5b9ea39",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x80a2274621c69b14ffe285fbf2e89835cc8e7ed129d69d81b449a44795a97faa",
                        "0xa5d221ca9b9c7dfe0817099bb3fb9bd5e3b78ea3fe40af10af7c5cab42a8f4e3",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0xc12d2089d06a72c5e84ea02ad40e16861046fb0034e2c916fdf7141cd2c1cde9",
                        "0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6",
                        "0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82",
                        "0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009",
                        "0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135",
                        "0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415",
                        "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                        "0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d",
                        "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                        "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                        "0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee",
                        "0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1",
                        "0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c",
                        "0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193",
                        "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                        "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                        "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                        "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                        "0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e",
                        "0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784",
                        "0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb",
                        "0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb",
                        "0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab",
                        "0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4",
                        "0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f",
                        "0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa",
                        "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                        "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                        "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                        "0x2600000000000000000000000000000000000000000000000000000000000000",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x2a4918cae204e346edce5e5217b8f599b8828a318f977fe1ce391f6b61561d6f",
                        "0xbb96fc581ca82f7bb41d3c063efe9bcf7433ff920717c737e8c040fd226de5e4",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0xbd4d202e6c042537e14dd66795af13b197c506911140787ad5e0f04d89a3051a",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x223c750bc1316859fef9208c0eba8602f047a597b625c84732ca945969f07c44",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                },
                "validatorBalanceProof": {
                    "balanceChunk": "0x1afd1056f00000008ba65061f000000021702771f00000000000000000000000",
                    "witnesses": [
                        "0x2d16a262f000000073343e65f00000009ca09d78f000000086fc3978f0000000",
                        "0xe4680a0fb66d465243bb200082351074ff88d2eff103fff2a57721c34eb32e5c",
                        "0xecfebdccb7521a88fc1199b6d738136983b3162dcc752ea710086ce3af9f770e",
                        "0x1cb0a214b3f236638a0d2aa7d01ee4692be4f3ab55897c241076ec8fd7f79a4f",
                        "0xaec7689d41a056f8b2f6593b28bdbca965052e5bef4daa2af26f4eb96f0b7723",
                        "0x12f8987500e29f48521d6eb0d49adaf9a84125f7f6038f13eec5c4ec0e325087",
                        "0x4492f7e1a0253992506c6aa61511527cf0e253f9755b42cf2b175bfb980072d9",
                        "0x20293382de1fc9752c89ba9ac27d44e1c19ca3e73a964d21fcb2ab0ffb36d7b1",
                        "0x84293e84e9e3c4d4db6d414b3015a6c7e5b5e8ab8cef75c2f15f3458910c2d6f",
                        "0x9ec51e98ada520455216a4a022d993495d45ad2dc5ca8de7c2cecc2549cec3f1",
                        "0xe5b67acb8dbedcc7d69667df7a5e3e0c2953e75e60feeeaa5e32210e862851c7",
                        "0xd554282ca737f83298a701f84480efbb7bf0ae55df149463b68fe062399129c9",
                        "0x000050d6dc0100000000000000000000c31c50d6dc010000d585fe41f0000000",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0xc2f71386993c8a7eed10eb2716fa7d2865c3deaee27cfeffaef851f5c565471a",
                        "0x4e5a68f75e9e4f55c1a069739ff540457ac19de7a4dd3eed19d23b1f4c4c0659",
                        "0x48eaa56825c034bcacb6e2b56c439c1f2e34742b8c10fad145d25df0a3979b2d",
                        "0xee6a3494a6960ea9f36bc1f7c30d1d8a93f9cf7f61efd7038e7742bfc5f4969d",
                        "0xcfd906c4c673f9f05fa40a1f65cc14551b47eede5c0f759156dcb16d5595e015",
                        "0x8ecb24f8b922efce255d0f380e3f12e6c78c33734048c70fb1328efacc5f29fd",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0xdd99115ce0ea771432dd3f2d6a78c68a72a4503adcacf0073cbefd7d43c05330",
                        "0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6",
                        "0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82",
                        "0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009",
                        "0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135",
                        "0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415",
                        "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                        "0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d",
                        "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                        "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                        "0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee",
                        "0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1",
                        "0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c",
                        "0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193",
                        "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                        "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                        "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                        "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                        "0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e",
                        "0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784",
                        "0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb",
                        "0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb",
                        "0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab",
                        "0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4",
                        "0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f",
                        "0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa",
                        "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                        "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                        "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                        "0x2600000000000000000000000000000000000000000000000000000000000000",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x2a4918cae204e346edce5e5217b8f599b8828a318f977fe1ce391f6b61561d6f",
                        "0xbb96fc581ca82f7bb41d3c063efe9bcf7433ff920717c737e8c040fd226de5e4",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0xbd4d202e6c042537e14dd66795af13b197c506911140787ad5e0f04d89a3051a",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x223c750bc1316859fef9208c0eba8602f047a597b625c84732ca945969f07c44",
                        "0x75698fcc96a639969574bd523e4c1bb2bd01a16cb1d6216e2ce9502486027e28",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x0e5a697ebfbc3c091854754d85adb4c7cb8459eea5f84c689e989e2d87c79647",
                        "0x3b63ee23f8970db7b1185e6ec95070031f6381bd91759d5e58f20904dd164945",
                        "0x80f87c603827d53ce704240032af39e73eac2d7bd9070b24b8bb251ee7f18a6c"
                    ]
                }
            };
            const proofData = encodeFinalBalanceProofV2(
                proofBundle.withdrawalProof,
                proofBundle.validatorProof,
                proofBundle.slotProof,
                proofBundle.previousNextWithdrawalIndexProof,
                proofBundle.validatorBalanceProof,
            );

            const verified = await verifier.verifyFinalBalance(slotTimestamp, 2, proofData);
            assert.equal(verified.validatorPubkeyHash, ethers.keccak256(proofBundle.validatorProof.validator.pubkey));
            assert.equal(verified.withdrawalCredentials, proofBundle.validatorProof.validator.withdrawalCredentials);
            assert.equal(verified.amountInGwei, BigInt(proofBundle.withdrawalProof.withdrawal.amountInGwei));
            assert.equal(verified.withdrawalEpoch, 9478n);
            assert.equal(verified.recentEpoch, 9792n);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify final balance with mixed historical post-Gloas proof bundle'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 80000n],
                beaconRoots.target,
            );

            const slotTimestamp = 311503n * 12n;
            const blockRoot = '0x148b124c6ee1e1f86a700693a7d3cf0d14747e4c2b939f9b41b7a870ae2014d9';
            await beaconRoots.setBlockRoot(slotTimestamp, blockRoot);

            // This bundle sits exactly on the historical boundary: the withdrawal and balance
            // proofs are direct, while the previous next withdrawal index proof is historical
            const proofBundle = {
                "withdrawalProof": {
                    "withdrawalSlot": 303311,
                    "withdrawalNum": 3,
                    "withdrawal": {
                        "index": 356356,
                        "validatorIndex": 415,
                        "withdrawalCredentials": "0xf97e180c050e5ab072211ad2c213eb5aee4df134",
                        "amountInGwei": 1032784338321
                    },
                    "witnesses": [
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x5d02307d49f87cf5d397afacb00f2bf28c68ab8f91d30bc13ef813265e666b6d",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x3d1270648c4e2ff66aae0a3b228aa2c8f9c5e7259d8d5df9b30b620ffd4c52bb",
                        "0x0400000000000000000000000000000000000000000000000000000000000000",
                        "0x156d633147a49d8a0719c7b31769d6268f3fad283251328a10556159c1dd5481",
                        "0xa55cfb1d72b46df5c3e329d8b4f3bc84968e682655c784bc7b9576f1acdb43e0",
                        "0x2059352345ea5091fc40cc3477a906328abaa91336f1b64b3add6b613c3ba786",
                        "0xd161fd73c3ccfaae92e672d8bb0462df656f0a36b6f546083bf81144fc857737",
                        "0x4098454302cb6442df06f9764cc3c9b0fa501bf98c724b8402c1d5aa35e8bc9f",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x6eef7c1a22363186acbd2ce3213eb7cba4effde6521bec42c007e39256786afd",
                        "0x8ecb24f8b922efce255d0f380e3f12e6c78c33734048c70fb1328efacc5f29fd",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x09ee07fac83444b2dc39abb8b48d673be3ae1a93f8c18270a18cd7da26f43eb5",
                        "0x6f988b58eb88c9e4e4732624164c7c37a7df5b4e525a6009938ebeaa2a710182",
                        "0x33e965a7cc2275502a1ba16a57380a058ca9761fd077ee0def945a37f44bb463",
                        "0x3d7bf97c3f9440dbba6d7903a64cce33c363788609fcc66cd6d2f62eeb06e2dc",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x2b967e0255001ae9e255d2561271891cf294cbbf0575973268ce7cb8a28d4d46",
                        "0xf802e4b35cab9b5b9a50478b897ddd6ffb77f95eda124a5b8844266f7560adb7",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x89821feae3b55f8808420996c5b11fe4e8893cadc3cdcd85fd5b81b4f3961b29",
                        "0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae",
                        "0x80af8fea82e2ab03877b6125a8a796e13bbaa3fbfc6de51137f5495e2331e6bb",
                        "0xc66dbdbe36b0b4e3fc621c0a1ad0ec7d9b85dfab3da1c625da5bb236389986ac",
                        "0xff58c3322e75a0f8dac4b11ba922ba1e15d92285ebce9eea089dbf3e493248d7",
                        "0x84e4a450588cffe5ae43383982066994b28cf9cb42a1885cd6e8268017edf340",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x3118314bd39d35d0dc403c137675d0782f8acf9e2642fa43cef4819b9a21092f",
                        "0xb8b91bff7a1de7bbba037bcc601cd3bc41757535c2d766aa572b6d15c197b8c8",
                        "0x77f0fbb078bc82830ce8a5d65867105c0518b1aafcac0a21d1085c768e96edf4"
                    ]
                },
                "validatorProof": {
                    "validatorIndex": 415,
                    "validator": {
                        "pubkey": "0x8182ea51511d54c9675c622810a623c14691d048f2212b6266c2d6e23f59d0b7aac0be4633f577c7092bbbdff5ec10f3",
                        "withdrawalCredentials": "0x020000000000000000000000f97e180c050e5ab072211ad2c213eb5aee4df134",
                        "effectiveBalance": 0,
                        "slashed": false,
                        "activationEligibilityEpoch": 0,
                        "activationEpoch": 0,
                        "exitEpoch": 9222,
                        "withdrawableEpoch": 9478
                    },
                    "witnesses": [
                        "0xdf4509bc3ec6a246a862079b27ece2f9f13e570cd7e22c3d294e409c61760ebe",
                        "0xf7b37cc9033932a4fab4f09142340030f5193440c6f72cdbff7e2494b45cea48",
                        "0x77597c024db6c7e9fa26e62b39882b3ab0e89c5ef8b6b856b9af1a19af0b870c",
                        "0x09f6861cd5666cb031717c70395b3b369cf6620969f5491e46fdc6785bfff91e",
                        "0x91ab84269f8a25ff87e9a04f6694fb06bdf667e5c80a95a0da08a9a3c00ad4a0",
                        "0x87eacc031a03d564c48ddd277ef659ca77ffb883d25a26a40e245ddd23f6fe3a",
                        "0xa3910fefecf7ed9cf22423bc289b25f621f6d0edd857f0d175de2343170c56e1",
                        "0xceac5aeb7b8939a7204cc00faebcfcfcff5789a0de1a5847307bd47e7ad9aacc",
                        "0xc17bb734f79cbdf076720feef697273d7063107c2960ddcf8d5360503ea2ac69",
                        "0xe5309d1f6c4a4ea62b9fffc26b26b3a6ed4501efc251693661658e3869046c08",
                        "0x9608b9497004fbbed548a388e15065bfe8ff12a98a3a50863394a2f117f47aaa",
                        "0x4fa702294acd29ff601026f3691235d04366f6ea824b76750c4507ab55a54161",
                        "0x530a383886ab4a59368da5ee861a510e605d5faadf1794252587cdca518b258a",
                        "0x396ca5c785751f4d85d42f54d6d53a378178021bbacb278511b61dfcd4a2a3f4",
                        "0x79da9845457a55211c9cbbca599154d874b4414dc65340aa2bc081da0852ca00",
                        "0x1832df13c6cfe44ca0b188aa3600f7d1402bb7e1f9fb97d32ecec23b82656566",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0xf2481c7c81b9c8496e96f38682653d8fa942ca5424ac2fd7f0d40ee2aebc375a",
                        "0x85517e471c4198983a8cf777cdb766d90a4c641b3678c3187d9c2a3be427a100",
                        "0x98268bcd696a733682bafb3a4a46063b46475f70388a0e8f4468cf734e953962",
                        "0xc66dbdbe36b0b4e3fc621c0a1ad0ec7d9b85dfab3da1c625da5bb236389986ac",
                        "0xff58c3322e75a0f8dac4b11ba922ba1e15d92285ebce9eea089dbf3e493248d7",
                        "0x84e4a450588cffe5ae43383982066994b28cf9cb42a1885cd6e8268017edf340",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x3118314bd39d35d0dc403c137675d0782f8acf9e2642fa43cef4819b9a21092f",
                        "0xb8b91bff7a1de7bbba037bcc601cd3bc41757535c2d766aa572b6d15c197b8c8",
                        "0x77f0fbb078bc82830ce8a5d65867105c0518b1aafcac0a21d1085c768e96edf4"
                    ]
                },
                "slotProof": {
                    "slot": 311503,
                    "witnesses": [
                        "0x8f9a8573a44269574a9a9c2d932243aaeeb9b88cd1ef1b83b3bea97f06d3bafe",
                        "0x83b2d7553a3a5cec8ff2f9f4eb6c3aa5e6c5bcaf49c1a69a0453403f9607c059",
                        "0xe21588fa14ba58a50023108ec284dd9d3d2c4c8a59c6a77bf4ea1bb90a9ae8c0",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x3118314bd39d35d0dc403c137675d0782f8acf9e2642fa43cef4819b9a21092f",
                        "0xb8b91bff7a1de7bbba037bcc601cd3bc41757535c2d766aa572b6d15c197b8c8",
                        "0x77f0fbb078bc82830ce8a5d65867105c0518b1aafcac0a21d1085c768e96edf4"
                    ]
                },
                "previousNextWithdrawalIndexProof": {
                    "nextWithdrawalIndex": 356353,
                    "witnesses": [
                        "0x3f71070000000000000000000000000000000000000000000000000000000000",
                        "0x9440ec6f27629619b1cedf11d09a62b7c216027d7af6ba30c7e5d845ed43acd0",
                        "0xb19ad0896be9709b24511d7c04ebf6a793114fa71a80f9e62821b8a3ad374e90",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0xae6c089c75b8f8a0046b943ce1627e474154891a78d48ddd7f2d03e5a5b9ea39",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0x80a2274621c69b14ffe285fbf2e89835cc8e7ed129d69d81b449a44795a97faa",
                        "0xa5d221ca9b9c7dfe0817099bb3fb9bd5e3b78ea3fe40af10af7c5cab42a8f4e3",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0xc12d2089d06a72c5e84ea02ad40e16861046fb0034e2c916fdf7141cd2c1cde9",
                        "0x717f76067a5dc21217873d502962e9757ff485bcbfe521ee36cc14dccf2231c6",
                        "0x45ff1a1d079edf2f0a4570fdbcdb57dc9d57eac80f408b005f643cbaa91cde82",
                        "0x36fb560a2106219bff9cff53687a51cbdbb667286ed2b77f0a2786a0aeaab7db",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x63a4229406afcdf1653a12d46a452ba3b3b8a773137033f4c5c9dde0d35c3009",
                        "0xf1083fb2333e46dbe58e7fbd3cd376e2d88de52a41dd8a5739510e701ec8cabe",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x727efcad6777221483b1606b82a1343a41a185c5ff3793426e7d68e2c5c88135",
                        "0x18df258c3d054fe2981007e500f053f4c6d9a36fd11cea2495a69df3c82a9415",
                        "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                        "0x2728533d29a33dca9e6b63943f4f9d7358a837fb3b9fe767db0e897baf13c47d",
                        "0xc78009fdf07fc56a11f122370658a353aaa542ed63e44c4bc15ff4cd105ab33c",
                        "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                        "0x5e3d28abbba6710fc37ed88793527bae6915b08c8aedc1981faf415b31af77ee",
                        "0xd88ddfeed400a8755596b21942c1497e114c302e6118290f91e6772976041fa1",
                        "0x87eb0ddba57e35f6d286673802a4af5975e22506c7cf4c64bb6be5ee11527f2c",
                        "0x26846476fd5fc54a5d43385167c95144f2643f533cc85bb9d16b782f8d7db193",
                        "0x506d86582d252405b840018792cad2bf1259f1ef5aa5f887e13cb2f0094f51e1",
                        "0xffff0ad7e659772f9534c195c815efc4014ef1e1daed4404c06385d11192e92b",
                        "0x6cf04127db05441cd833107a52be852868890e4317e6a02ab47683aa75964220",
                        "0xb7d05f875f140027ef5118a2247bbb84ce8f2f0f1123623085daf7960c329f5f",
                        "0xdf6af5f5bbdb6be9ef8aa618e4bf8073960867171e29676f8b284dea6a08a85e",
                        "0xb58d900f5e182e3c50ef74969ea16c7726c549757cc23523c369587da7293784",
                        "0xd49a7502ffcfb0340b1d7885688500ca308161a7f96b62df9d083b71fcc8f2bb",
                        "0x8fe6b1689256c0d385f42f5bbe2027a22c1996e110ba97c171d3e5948de92beb",
                        "0x8d0d63c39ebade8509e0ae3c9c3876fb5fa112be18f905ecacfecb92057603ab",
                        "0x95eec8b2e541cad4e91de38385f2e046619f54496c2382cb6cacd5b98c26f5a4",
                        "0xf893e908917775b62bff23294dbbe3a1cd8e6cc1c35b4801887b646a6f81f17f",
                        "0xcddba7b592e3133393c16194fac7431abf2f5485ed711db282183c819e08ebaa",
                        "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                        "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                        "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                        "0x2600000000000000000000000000000000000000000000000000000000000000",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0xe60a722e18d49fafa877a9dfef1aac12441691685eabe799d1505f93a8c972f8",
                        "0x99e3e43d3d5ea8379bbd35598ac9382c5028255399d9ea0019ba4313258925fc",
                        "0xba772a825d24675ec95268e5353c10cc72fdc1b49fd2dbb780de72033f362672",
                        "0x72ad4c0a39f0424c3fa3c24367fc23c8450210683b14d05f1fbff2eb10bbb3fe",
                        "0x9efde052aa15429fae05bad4d0b1d7c64da64d03d7a1854a588c2cb8430c0d30",
                        "0x0000000000000000000000000000000000000000000000000000000000000000",
                        "0xab7a3dd6dd30fae333d85338b9dad2548fd2adb246f9c3d6e379f5c4225267f1",
                        "0x84e4a450588cffe5ae43383982066994b28cf9cb42a1885cd6e8268017edf340",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x3118314bd39d35d0dc403c137675d0782f8acf9e2642fa43cef4819b9a21092f",
                        "0xb8b91bff7a1de7bbba037bcc601cd3bc41757535c2d766aa572b6d15c197b8c8",
                        "0x77f0fbb078bc82830ce8a5d65867105c0518b1aafcac0a21d1085c768e96edf4"
                    ]
                },
                "validatorBalanceProof": {
                    "balanceChunk": "0x1afd1056f00000008ba65061f000000021702771f00000000000000000000000",
                    "witnesses": [
                        "0x2d16a262f000000073343e65f00000009ca09d78f000000086fc3978f0000000",
                        "0xe4680a0fb66d465243bb200082351074ff88d2eff103fff2a57721c34eb32e5c",
                        "0xecfebdccb7521a88fc1199b6d738136983b3162dcc752ea710086ce3af9f770e",
                        "0x1cb0a214b3f236638a0d2aa7d01ee4692be4f3ab55897c241076ec8fd7f79a4f",
                        "0xaec7689d41a056f8b2f6593b28bdbca965052e5bef4daa2af26f4eb96f0b7723",
                        "0x12f8987500e29f48521d6eb0d49adaf9a84125f7f6038f13eec5c4ec0e325087",
                        "0x4492f7e1a0253992506c6aa61511527cf0e253f9755b42cf2b175bfb980072d9",
                        "0x20293382de1fc9752c89ba9ac27d44e1c19ca3e73a964d21fcb2ab0ffb36d7b1",
                        "0x84293e84e9e3c4d4db6d414b3015a6c7e5b5e8ab8cef75c2f15f3458910c2d6f",
                        "0x9ec51e98ada520455216a4a022d993495d45ad2dc5ca8de7c2cecc2549cec3f1",
                        "0xe5b67acb8dbedcc7d69667df7a5e3e0c2953e75e60feeeaa5e32210e862851c7",
                        "0xd554282ca737f83298a701f84480efbb7bf0ae55df149463b68fe062399129c9",
                        "0x000050d6dc0100000000000000000000c31c50d6dc010000d585fe41f0000000",
                        "0x4eaf070000000000000000000000000000000000000000000000000000000000",
                        "0xc2f71386993c8a7eed10eb2716fa7d2865c3deaee27cfeffaef851f5c565471a",
                        "0x4e5a68f75e9e4f55c1a069739ff540457ac19de7a4dd3eed19d23b1f4c4c0659",
                        "0x48eaa56825c034bcacb6e2b56c439c1f2e34742b8c10fad145d25df0a3979b2d",
                        "0xee6a3494a6960ea9f36bc1f7c30d1d8a93f9cf7f61efd7038e7742bfc5f4969d",
                        "0xcfd906c4c673f9f05fa40a1f65cc14551b47eede5c0f759156dcb16d5595e015",
                        "0x8ecb24f8b922efce255d0f380e3f12e6c78c33734048c70fb1328efacc5f29fd",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x09ee07fac83444b2dc39abb8b48d673be3ae1a93f8c18270a18cd7da26f43eb5",
                        "0x6f988b58eb88c9e4e4732624164c7c37a7df5b4e525a6009938ebeaa2a710182",
                        "0x33e965a7cc2275502a1ba16a57380a058ca9761fd077ee0def945a37f44bb463",
                        "0x3d7bf97c3f9440dbba6d7903a64cce33c363788609fcc66cd6d2f62eeb06e2dc",
                        "0x231e88b8a95b16121b25ecd3a48de0d4bbdbbeab6c086ffa6fff741fd0bd2d28",
                        "0x84c52e8bd94b1e2b5326d71500368cd71f78ef9cc1b4c49ce82426eb49c0201a",
                        "0x2b967e0255001ae9e255d2561271891cf294cbbf0575973268ce7cb8a28d4d46",
                        "0xf802e4b35cab9b5b9a50478b897ddd6ffb77f95eda124a5b8844266f7560adb7",
                        "0x714fa0f628bae915eb4e7d501441fe9e26d0636809d38f36e68bc853fe5c97e1",
                        "0x24ccee59776b4f8306fb153bd6cdaed5dcc200f4cef88237d88a15ac0820dfc5",
                        "0x11f5f791b22f1c01e103bf8c216e6b3fdac1cd1d41789178cf2bd347d3567c07",
                        "0xe1370dfbe8c5cb73536f0ed8466e8d3d7f088123c9e936fe4e5311f1803120e1",
                        "0x315a292bcd969c9a06cb81d50f73a38b16607d63219dbbd8d6014c498c96e916",
                        "0x89821feae3b55f8808420996c5b11fe4e8893cadc3cdcd85fd5b81b4f3961b29",
                        "0xfa4f2a42c3db80ea739a203e82076243c3130998ce30e00491bc457077912cae",
                        "0x80af8fea82e2ab03877b6125a8a796e13bbaa3fbfc6de51137f5495e2331e6bb",
                        "0xc66dbdbe36b0b4e3fc621c0a1ad0ec7d9b85dfab3da1c625da5bb236389986ac",
                        "0xff58c3322e75a0f8dac4b11ba922ba1e15d92285ebce9eea089dbf3e493248d7",
                        "0x84e4a450588cffe5ae43383982066994b28cf9cb42a1885cd6e8268017edf340",
                        "0xc024566a00000000000000000000000000000000000000000000000000000000",
                        "0xffffffffff3f0000000000000000000000000000000000000000000000000000",
                        "0x3118314bd39d35d0dc403c137675d0782f8acf9e2642fa43cef4819b9a21092f",
                        "0xb8b91bff7a1de7bbba037bcc601cd3bc41757535c2d766aa572b6d15c197b8c8",
                        "0x77f0fbb078bc82830ce8a5d65867105c0518b1aafcac0a21d1085c768e96edf4"
                    ]
                }
            };
            const proofData = encodeFinalBalanceProofV2(
                proofBundle.withdrawalProof,
                proofBundle.validatorProof,
                proofBundle.slotProof,
                proofBundle.previousNextWithdrawalIndexProof,
                proofBundle.validatorBalanceProof,
            );

            const verified = await verifier.verifyFinalBalance(slotTimestamp, 2, proofData);
            assert.equal(verified.validatorPubkeyHash, ethers.keccak256(proofBundle.validatorProof.validator.pubkey));
            assert.equal(verified.withdrawalCredentials, proofBundle.validatorProof.validator.withdrawalCredentials);
            assert.equal(verified.amountInGwei, BigInt(proofBundle.withdrawalProof.withdrawal.amountInGwei));
            assert.equal(verified.withdrawalEpoch, 9478n);
            assert.equal(verified.recentEpoch, 9734n);
        });


        it(printTitle('BeaconStateVerifier', 'Requires a fresh expected withdrawal and zero balance in final balance proof version 2'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const beaconStateVerifier = await artifacts.require('BeaconStateVerifier').clone(
                rocketStorage.target,
                8192n,
                [0n, 0n, 0n, 0n, 0n, 0n, 14000000n],
                beaconRoots.target,
            );

            const slot = 14000010n;
            const withdrawalSlot = 14000005n;
            const previousSlot = withdrawalSlot - 1n;
            const slotTimestamp = (slot * 12n + 1606824023n) + 12n;
            const withdrawalNum = 3;
            const validatorIndex = 123456n;
            const nextWithdrawalIndex = 91000000n;
            const withdrawal = {
                index: nextWithdrawalIndex + BigInt(withdrawalNum),
                validatorIndex,
                withdrawalCredentials: '0xf97e180c050e5ab072211ad2c213eb5aee4df134',
                amountInGwei: 1026000000000n,
            };
            const validator = {
                pubkey: '0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c',
                withdrawalCredentials: '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                effectiveBalance: 32000000000n,
                slashed: false,
                activationEligibilityEpoch: 0n,
                activationEpoch: 0n,
                exitEpoch: withdrawalSlot / 32n,
                withdrawableEpoch: withdrawalSlot / 32n,
            };

            const slotPath = '011' + progressivePath(2);
            const withdrawalPath = '011'
                + progressivePath(6)
                + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                + progressivePath(44)
                + progressivePath(withdrawalNum);
            const nextWithdrawalIndexPath = '011'
                + progressivePath(6)
                + (previousSlot % 8192n).toString(2).padStart(13, '0')
                + progressivePath(25);

            const withdrawalProofType = 'tuple(uint64,uint16,tuple(uint64,uint64,bytes20,uint64),bytes32[])';
            const validatorProofType = 'tuple(uint40,tuple(bytes,bytes32,uint64,bool,uint64,uint64,uint64,uint64),bytes32[])';
            const slotProofType = 'tuple(uint64,bytes32[])';
            const nextWithdrawalIndexProofType = 'tuple(uint64,bytes32[])';
            const validatorBalanceProofType = 'tuple(bytes32,bytes32[])';
            const finalBalanceProofV2Type = `tuple(${withdrawalProofType},${validatorProofType},${slotProofType},${nextWithdrawalIndexProofType},${validatorBalanceProofType})`;

            function buildProof(
                provenNextWithdrawalIndex,
                provenValidatorIndex = validatorIndex,
                provenBalance = 0n,
                suppliedBalanceChunk = undefined,
            ) {
                const provenWithdrawal = { ...withdrawal, validatorIndex: provenValidatorIndex };
                const validatorPath = '011' + progressivePath(11) + progressivePath(provenValidatorIndex);
                const balancePath = '011'
                    + progressivePath(6)
                    + (withdrawalSlot % 8192n).toString(2).padStart(13, '0')
                    + progressivePath(12)
                    + progressivePath(provenValidatorIndex / 4n);
                const balances = [11n, 22n, 33n, 44n];
                balances[Number(provenValidatorIndex % 4n)] = provenBalance;
                const balanceChunk = packUint64s(balances);
                const proofs = makeMultiProofs([
                    { path: slotPath, leaf: toLittleEndian(slot) },
                    { path: validatorPath, leaf: merkleiseValidator(validator) },
                    { path: withdrawalPath, leaf: merkleiseWithdrawal(provenWithdrawal) },
                    { path: nextWithdrawalIndexPath, leaf: toLittleEndian(provenNextWithdrawalIndex) },
                    { path: balancePath, leaf: balanceChunk },
                ]);
                const withdrawalProof = [
                    withdrawalSlot,
                    withdrawalNum,
                    [provenWithdrawal.index, provenWithdrawal.validatorIndex, provenWithdrawal.withdrawalCredentials, provenWithdrawal.amountInGwei],
                    proofs.witnesses.get(withdrawalPath),
                ];
                const validatorProof = [
                    provenValidatorIndex,
                    [
                        validator.pubkey,
                        validator.withdrawalCredentials,
                        validator.effectiveBalance,
                        validator.slashed,
                        validator.activationEligibilityEpoch,
                        validator.activationEpoch,
                        validator.exitEpoch,
                        validator.withdrawableEpoch,
                    ],
                    proofs.witnesses.get(validatorPath),
                ];
                const slotProof = [slot, proofs.witnesses.get(slotPath)];
                const nextWithdrawalIndexProof = [
                    provenNextWithdrawalIndex,
                    proofs.witnesses.get(nextWithdrawalIndexPath),
                ];
                const validatorBalanceProof = [
                    suppliedBalanceChunk === undefined ? balanceChunk : suppliedBalanceChunk,
                    proofs.witnesses.get(balancePath),
                ];
                return {
                    root: proofs.root,
                    proofData: ethers.AbiCoder.defaultAbiCoder().encode(
                        [finalBalanceProofV2Type],
                        [[withdrawalProof, validatorProof, slotProof, nextWithdrawalIndexProof, validatorBalanceProof]],
                    ),
                    legacyProofData: ethers.AbiCoder.defaultAbiCoder().encode(
                        [`tuple(${withdrawalProofType},${validatorProofType},${slotProofType})`],
                        [[withdrawalProof, validatorProof, slotProof]],
                    ),
                };
            }

            const freshProof = buildProof(nextWithdrawalIndex);
            const decodedLegacyProof = ethers.AbiCoder.defaultAbiCoder().decode(
                [`tuple(${withdrawalProofType},${validatorProofType},${slotProofType})`],
                freshProof.legacyProofData,
            )[0];
            assert.equal(decodedLegacyProof[0][0], withdrawalSlot);
            await beaconRoots.setBlockRoot(slotTimestamp, freshProof.root);
            const verified = await beaconStateVerifier.verifyFinalBalance(slotTimestamp, 2, freshProof.proofData);
            assert.equal(verified.validatorPubkeyHash, ethers.keccak256(validator.pubkey));
            assert.equal(verified.withdrawalCredentials, validator.withdrawalCredentials);
            assert.equal(verified.amountInGwei, withdrawal.amountInGwei);
            assert.equal(verified.withdrawalEpoch, withdrawalSlot / 32n);
            assert.equal(verified.recentEpoch, slot / 32n);

            for (let lane = 1n; lane < 4n; ++lane) {
                const laneProof = buildProof(nextWithdrawalIndex, validatorIndex + lane);
                await beaconRoots.setBlockRoot(slotTimestamp, laneProof.root);
                await beaconStateVerifier.verifyFinalBalance(slotTimestamp, 2, laneProof.proofData);
            }

            const nonzeroBalanceProof = buildProof(nextWithdrawalIndex, validatorIndex + 2n, 1n);
            await beaconRoots.setBlockRoot(slotTimestamp, nonzeroBalanceProof.root);
            await shouldRevert(
                beaconStateVerifier.verifyFinalBalance(slotTimestamp, 2, nonzeroBalanceProof.proofData),
                'Accepted a nonzero post-withdrawal validator balance',
                'Validator balance not zero',
            );

            const tamperedBalanceProof = buildProof(
                nextWithdrawalIndex,
                validatorIndex,
                0n,
                packUint64s([1n, 22n, 33n, 44n]),
            );
            await beaconRoots.setBlockRoot(slotTimestamp, tamperedBalanceProof.root);
            await shouldRevert(
                beaconStateVerifier.verifyFinalBalance(slotTimestamp, 2, tamperedBalanceProof.proofData),
                'Accepted a balance chunk not committed by the beacon state',
                'Invalid validator balance proof',
            );

            await shouldRevert(
                beaconStateVerifier.verifyFinalBalance(slotTimestamp, 1, freshProof.legacyProofData),
                'Accepted final balance proof version 1 after Gloas',
                'Unsupported proof version',
            );

            const staleProof = buildProof(nextWithdrawalIndex + 1n);
            await beaconRoots.setBlockRoot(slotTimestamp, staleProof.root);
            await shouldRevert(
                beaconStateVerifier.verifyFinalBalance(slotTimestamp, 2, staleProof.proofData),
                'Accepted stale expected withdrawal as a final withdrawal',
                'Stale withdrawal proof',
            );
        });

        it(printTitle('BeaconStateVerifier', 'Can verify historical post-Gloas expected withdrawal proof'), async () => {
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

            assert.equal(await verifierHarness.verifyWithdrawalProof(slotTimestamp, slot, {
                withdrawalSlot,
                withdrawalNum: 0,
                withdrawal,
                witnesses,
            }), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify real historical post-Gloas expected withdrawal proof'), async () => {
            const beaconRoots = await BeaconStateVerifier.deployed();
            const rocketStorage = await artifacts.require('RocketStorage').deployed();
            const verifier = await artifacts.require('BeaconStateVerifierHarness').clone(
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

            assert.equal(await verifier.verifyWithdrawalProof(slotTimestamp, slot, proof), true);
        });
    });
}
