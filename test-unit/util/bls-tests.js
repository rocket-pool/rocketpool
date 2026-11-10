import { before, describe, it } from 'mocha';
import { expect } from 'chai';
import { createHash } from 'node:crypto';
import { bls12_381 as bls } from '@noble/curves/bls12-381';

const { ethers, getNetworkConnection } = require('../_utils/hardhat-runtime');
const verifyVectors = require('./fixtures/bls/ethereum-verify-v0.1.2.json');
const g1Vectors = require('./fixtures/bls/ethereum-deserialization_G1-v0.1.2.json');
const g2Vectors = require('./fixtures/bls/ethereum-deserialization_G2-v0.1.2.json');
const suite = { DST: 'BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_' };
const bytes = value => Buffer.from(value.replace(/^0x/, ''), 'hex');
const hex = value => `0x${Buffer.from(value).toString('hex')}`;
const sha = (...parts) => createHash('sha256').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest();
const limbs = value => [value >> 256n, value & ((1n << 256n) - 1n)];
const join = (hi, lo) => (hi << 256n) | lo;
const credentials = `0x01${'00'.repeat(11)}${'12'.repeat(20)}`;
const zero = `0x${'00'.repeat(32)}`;

function deposit(key = 42n, amount = 1_000_000_000n, fork = '0x00000000') {
    const pubkey = hex(bls.getPublicKey(key));
    const encodedAmount = Buffer.alloc(32);
    encodedAmount.writeBigUInt64LE(amount);
    const messageRoot = sha(sha(sha(bytes(pubkey), Buffer.alloc(16)), bytes(credentials)), sha(encodedAmount, Buffer.alloc(32)));
    const forkRoot = sha(bytes(fork), Buffer.alloc(28), Buffer.alloc(32));
    const domain = Buffer.concat([Buffer.from('03000000', 'hex'), forkRoot.subarray(0, 28)]);
    const root = sha(messageRoot, domain);
    return { pubkey, amount, root: hex(root), domain: hex(domain), signature: hex(bls.sign(root, key, suite)) };
}

function reference(group, encoded) {
    const { x, y } = (group === 'G1' ? bls.G1.ProjectivePoint.fromHex(bytes(encoded)) : bls.Signature.fromHex(bytes(encoded))).toAffine();
    return group === 'G1' ? [...limbs(x), ...limbs(y)] : [...limbs(x.c0), ...limbs(x.c1), ...limbs(y.c0), ...limbs(y.c1)];
}

export default function() {
    describe('BLSDepositVerifier', function() {
        let verifier;
        let harness;
        let sample;
        const callDeposit = d => verifier.verifyDepositSignature(d.pubkey, credentials, d.amount, d.signature);
        before(async function() {
            verifier = await (await ethers.getContractFactory('BLSDepositVerifier')).deploy('0x00000000');
            harness = await (await ethers.getContractFactory('BLSVerifierHarness')).deploy();
            await Promise.all([verifier.waitForDeployment(), harness.waitForDeployment()]);
            sample = deposit();
        });

        describe('all 29 Ethereum verify vectors, including false for malformed inputs', function() {
            for (const [name, vector] of Object.entries(verifyVectors)) {
                it(name, async function() {
                    expect(await verifier.verifySignature(vector.input.message, vector.input.pubkey, vector.input.signature))
                        .to.equal(vector.output);
                });
            }
        });

        for (const [group, vectors] of [['G1', g1Vectors], ['G2', g2Vectors]]) {
            describe(`all Ethereum deserialization_${group} vectors with deposit infinity policy`, function() {
                for (const [name, vector] of Object.entries(vectors)) {
                    it(name, async function() {
                        const encoded = `0x${vector.input.pubkey ?? vector.input.signature}`;
                        const expected = vector.output && name !== 'deserialization_succeeds_infinity_with_true_b_flag';
                        const [valid, point] = await harness[`decode${group}`](encoded);
                        expect(valid).to.equal(expected);
                        if (expected) {
                            expect(Array.from(point)).to.deep.equal(reference(group, encoded));
                        } else {
                            expect(await verifier.verifySignature(sample.root,
                                group === 'G1' ? encoded : sample.pubkey, group === 'G2' ? encoded : sample.signature)).to.equal(false);
                        }
                    });
                }
            });
        }

        it('verifies deposit domain, amounts and altered message fields', async function() {
            expect(await verifier.depositDomain()).to.equal(sample.domain);
            expect(sample.domain).to.equal('0x03000000f5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a9');
            for (const amount of [1_000_000_000n, 32_000_000_000n, 2_048_000_000_000n, (1n << 64n) - 1n]) {
                expect(await callDeposit(deposit(42n, amount))).to.equal(true);
            }
            expect(await callDeposit({ ...sample, amount: sample.amount + 1n })).to.equal(false);
            expect(await verifier.verifyDepositSignature(sample.pubkey, zero, sample.amount, sample.signature)).to.equal(false);
            const other = await (await ethers.getContractFactory('BLSDepositVerifier')).deploy('0x10000910');
            expect(await other.verifyDepositSignature(sample.pubkey, credentials, sample.amount, sample.signature)).to.equal(false);
            const d = deposit(42n, sample.amount, '0x10000910');
            expect(await other.verifyDepositSignature(d.pubkey, credentials, d.amount, d.signature)).to.equal(true);
        });

        it('matches Noble for 24 deterministic deposits, altered roots and both point signs', async function() {
            for (let i = 1; i <= 24; ++i) {
                const key = BigInt(hex(sha(`RPIP-79 complete key ${i}`))) % (bls.params.r - 1n) + 1n;
                const d = deposit(key, sample.amount + BigInt(i));
                expect(bls.verify(bytes(d.signature), bytes(d.root), bytes(d.pubkey), suite)).to.equal(true);
                expect(await callDeposit(d)).to.equal(true);
                const alteredRoot = hex(sha(bytes(d.root)));
                expect(bls.verify(bytes(d.signature), bytes(alteredRoot), bytes(d.pubkey), suite)).to.equal(false);
                expect(await verifier.verifySignature(alteredRoot, d.pubkey, d.signature)).to.equal(false);
                const negativeKey = bytes(d.pubkey);
                const negativeSig = bytes(d.signature);
                negativeKey[0] ^= 0x20;
                negativeSig[0] ^= 0x20;
                expect(await verifier.verifySignature(d.root, d.pubkey, hex(negativeSig))).to.equal(false);
                // Negating both points preserves the signature equation for a fixed message.
                expect(await verifier.verifySignature(d.root, hex(negativeKey), hex(negativeSig))).to.equal(true);
                for (const [group, encoded] of [['G1', hex(negativeKey)], ['G2', hex(negativeSig)]]) {
                    const [valid, point] = await harness[`decode${group}`](encoded);
                    expect(valid).to.equal(true);
                    expect(Array.from(point)).to.deep.equal(reference(group, encoded));
                }
            }
        });

        it('rejects malformed lengths and every invalid compression/infinity flag combination', async function() {
            for (const [group, field, length] of [['G1', 'pubkey', 48], ['G2', 'signature', 96]]) {
                const candidates = [0, 1, length - 1, length + 1].map(n => Buffer.alloc(n));
                for (const flags of [0x00, 0x20, 0x40, 0x60, 0xc0, 0xe0]) {
                    const input = bytes(sample[field]);
                    input[0] = (input[0] & 0x1f) | flags;
                    candidates.push(input);
                }
                for (const candidate of candidates) {
                    const d = { ...sample, [field]: hex(candidate) };
                    expect(await callDeposit(d)).to.equal(false);
                    expect((await harness[`decode${group}`](hex(candidate)))[0]).to.equal(false);
                }
            }
        });

        it('matches independent verification for 48 deterministic arbitrary compressed encodings', async function() {
            for (let i = 0; i < 24; ++i) {
                for (const field of ['pubkey', 'signature']) {
                    const raw = Buffer.concat([sha(`random A ${field} ${i}`), sha(`random B ${field} ${i}`), sha(`random C ${field} ${i}`)]);
                    const candidate = raw.subarray(0, field === 'pubkey' ? 48 : 96);
                    candidate[0] = (candidate[0] & 0x1f) | 0x80 | ((i % 2) << 5);
                    const d = { ...sample, [field]: hex(candidate) };
                    let expected;
                    try { expected = bls.verify(bytes(d.signature), bytes(d.root), bytes(d.pubkey), suite); } catch { expected = false; }
                    expect(await verifier.verifySignature(d.root, d.pubkey, d.signature)).to.equal(expected);
                }
            }
        });

        it('covers zero, real, imaginary, generic and non-residue Fp2 square roots', async function() {
            const p = bls.fields.Fp.ORDER;
            const mod = n => ((n % p) + p) % p;
            for (const [c0, c1, expected] of [[0n, 0n, true], [4n, 0n, true], [p - 1n, 0n, true], [p - 7n, 24n, true], [1n, 1n, false]]) {
                const [valid, y] = await harness.sqrtFp2(...limbs(c1), ...limbs(c0));
                expect(valid).to.equal(expected);
                if (valid) {
                    const a = join(y[0], y[1]);
                    const b = join(y[2], y[3]);
                    expect(mod(a * a - b * b)).to.equal(c0);
                    expect(mod(2n * a * b)).to.equal(c1);
                }
            }
        });

        it('checks subgroup control generators against Noble and real precompiles', async function() {
            const [g1, g2] = await harness.generators();
            expect(Array.from(g1)).to.deep.equal(reference('G1', hex(bls.getPublicKey(1n))));
            const base2 = bls.G2.ProjectivePoint.BASE.toAffine();
            expect(Array.from(g2)).to.deep.equal([base2.x.c0, base2.x.c1, base2.y.c0, base2.y.c1].flatMap(limbs));
            for (const [point, target, budget] of [[g1, '0x000000000000000000000000000000000000000c', 12_000], [g2, '0x000000000000000000000000000000000000000e', 22_500]]) {
                const encoded = ethers.AbiCoder.defaultAbiCoder().encode([`uint256[${point.length}]`], [Array.from(point)]);
                expect(await harness.subgroupAt(target, encoded, encoded, budget)).to.equal(true);
                // An insufficient fixed budget must fail closed even if outer gas is ample.
                await expect(harness.subgroupAt(target, encoded, encoded, budget - 1)).to.be.revertedWith('Precompile failed');
            }
            const control = ethers.AbiCoder.defaultAbiCoder().encode(['uint256[4]'], [Array.from(g1)]);
            const orderThree = ethers.AbiCoder.defaultAbiCoder().encode(['uint256[4]'], [[0n, 0n, 0n, 2n]]);
            expect(await harness.subgroupAt('0x000000000000000000000000000000000000000c', orderThree, control, 12_000)).to.equal(false);
            await expect(harness.subgroupAt('0x000000000000000000000000000000000000000c', orderThree, control, 11_999))
                .to.be.revertedWith('Precompile failed');
        });

        it('reverts on absent, reverting, truncated or inconsistent precompile output', async function() {
            const address = '0x000000000000000000000000000000000000b100';
            const snapshot = await ethers.provider.send('evm_snapshot', []);
            try {
                const [g1] = await harness.generators();
                const point = ethers.AbiCoder.defaultAbiCoder().encode(['uint256[4]'], [Array.from(g1)]);
                for (const code of ['0x', '0x60006000fd', '0x600160005360016000f3', '0x60806000f3']) {
                    await ethers.provider.send('hardhat_setCode', [address, code]);
                    await expect(harness.subgroupAt(address, point, point, 12_000)).to.be.revertedWith('Precompile failed');
                }
                // Final pairing failures must revert, never be caught as a false signature.
                await expect(harness.pairing('0x')).to.be.revertedWith('Pairing execution failed');
            } finally { await ethers.provider.send('evm_revert', [snapshot]); }
        });

        it('never returns false for a valid signature across underfunded call stipends', async function() {
            const data = verifier.interface.encodeFunctionData('verifyDepositSignature', [sample.pubkey, credentials, sample.amount, sample.signature]);
            let reverts = 0;
            let successes = 0;
            for (let budget = 20_000; budget <= 1_000_000; budget += 10_000) {
                const [success, result] = await harness.callWithGas(verifier.target, data, budget, { gasLimit: 2_000_000 });
                if (success) {
                    expect(ethers.AbiCoder.defaultAbiCoder().decode(['bool'], result)[0]).to.equal(true);
                    ++successes;
                } else { ++reverts; }
            }
            expect(reverts).to.be.greaterThan(0);
            expect(successes).to.be.greaterThan(0);
        });

        it('measures complete deposit verification gas and deployed size', async function() {
            const [sender] = await ethers.getSigners();
            const gas = {};
            const badKey = `0x${g1Vectors.deserialization_fails_not_in_G1.input.pubkey}`;
            const badSignature = `0x${g2Vectors.deserialization_fails_not_in_G2.input.signature}`;
            for (const [label, d] of [
                ['valid deposit', sample], ['incorrect signature', { ...sample, amount: sample.amount + 1n }],
                ['G1 non-subgroup', { ...sample, pubkey: badKey }], ['G2 non-subgroup', { ...sample, signature: badSignature }],
                ['malformed signature', { ...sample, signature: '0x1234' }],
            ]) {
                const data = verifier.interface.encodeFunctionData('verifyDepositSignature', [d.pubkey, credentials, d.amount, d.signature]);
                gas[label] = (await (await sender.sendTransaction({ to: verifier.target, data })).wait()).gasUsed.toString();
            }
            const size = ((await ethers.provider.getCode(verifier.target)).length - 2) / 2;
            expect(size).to.be.lessThanOrEqual(24_576);
            console.log(`Complete BLS verifier gas: ${getNetworkConnection().networkConfig.hardfork}; deployed size: ${size} bytes`);
            console.table(gas);
        });
    });
}
