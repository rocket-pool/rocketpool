import { before, describe, it } from 'mocha';
import { expect } from 'chai';
import { createHash } from 'node:crypto';
import { bls12_381 as bls } from '@noble/curves/bls12-381';

const { ethers } = require('../_utils/hardhat-runtime');
const extra = require('./fixtures/bls/ethereum-additional-v0.1.2.json');
const p = bls.fields.Fp.ORDER;
const B = 1n << 256n;
const limbs = a => [a >> 256n, a & (B - 1n)];
const integer = a => (a[0] << 256n) | a[1];
const pair = a => [limbs(a[0]), limbs(a[1])];
const pairInteger = a => [integer(a[0]), integer(a[1])];
const mod = a => ((a % p) + p) % p;
const hex = a => `0x${Buffer.from(a).toString('hex')}`;
const raw = a => Buffer.from(a.replace(/^0x/, ''), 'hex');
const digest = s => createHash('sha512').update(s).digest('hex');
const random = s => BigInt(`0x${digest(s)}`) % p;
const mul2 = (a, b) => [mod(a[0] * b[0] - a[1] * b[1]), mod(a[0] * b[1] + a[1] * b[0])];
function power(a, e) { let r = 1n; for (; e; e >>= 1n, a = a * a % p) if (e & 1n) r = r * a % p; return r; }

const boundary = [...new Set([
    0n, 1n, 2n, 3n, p - 1n, p - 2n, p / 2n, p / 2n + 1n,
    (1n << 128n) - 1n, 1n << 128n, (1n << 128n) + 1n,
    (1n << 255n) - 1n, 1n << 255n, (1n << 255n) + 1n,
    B - 1n, B, B + 1n, 2n * B - 1n, 2n * B,
    (1n << 380n) - 1n, 1n << 380n, (1n << 380n) + 1n,
    p - B - 1n, p - B, p - B + 1n,
])];

// All encoded points from the remaining official vector families; no regeneration
// of their expected signature results. Hash-to-G2 coordinates are checked separately.
const pointCorpus = new Set();
function collect(value) {
    if (typeof value === 'string' && /^0x(?:[0-9a-f]{96}|[0-9a-f]{192})$/i.test(value)) pointCorpus.add(value);
    else if (value && typeof value === 'object') for (const item of Object.values(value)) collect(item);
}
collect(extra);

export default function() {
    describe('BLSField', function() {
        let math;
        let verifier;
        before(async function() {
            math = await (await ethers.getContractFactory('BLSFieldHarness')).deploy();
            verifier = await (await ethers.getContractFactory('BLSVerifierHarness')).deploy();
            await Promise.all([math.waitForDeployment(), verifier.waitForDeployment()]);
        });

        async function checkArithmetic(a, b) {
            const [full, reduced, sum, difference, halved, negative] = await math.arithmetic(limbs(a), limbs(b));
            expect((full[0] << 512n) | (full[1] << 256n) | full[2]).to.equal(a * b);
            expect(integer(reduced)).to.equal(a * b % p);
            expect(integer(sum)).to.equal((a + b) % p);
            expect(integer(difference)).to.equal(mod(a - b));
            expect(integer(halved)).to.equal((a % 2n ? a + p : a) / 2n);
            expect(integer(negative)).to.equal(mod(-a));
            for (const value of [reduced, sum, difference, halved, negative]) expect(integer(value) < p).to.equal(true);
        }

        it(`matches BigInt for all ${boundary.length ** 2} boundary pairs, including multiword carries and borrows`, async function() {
            for (const a of boundary) for (const b of boundary) await checkArithmetic(a, b);
        });

        it('matches BigInt for 1,024 deterministic full-width random products and field operations', async function() {
            for (let i = 0; i < 1024; ++i) await checkArithmetic(random(`a ${i}`), random(`b ${i}`));
        });

        it('matches modular exponentiation for 153 boundary/random Fp roots and inverses', async function() {
            const inputs = [...boundary, ...Array.from({length:128}, (_, i) => random(`root ${i}`))];
            for (const a of inputs) {
                const [exists, root] = await math.root(limbs(a));
                expect(exists).to.equal(a === 0n || power(a, (p - 1n) / 2n) === 1n);
                if (exists) expect(integer(root) ** 2n % p).to.equal(a);
                if (a !== 0n) expect(integer(await math.inverse(limbs(a)))).to.equal(power(a, p - 2n));
            }
            await expect(math.inverse([0, 0])).to.be.revertedWith('Inverse of zero');
            for (const a of [p, p + 1n, (1n << 384n) - 1n]) {
                await expect(math.arithmetic(limbs(a), [0, 1])).to.be.revertedWith('non-canonical input');
            }
        });

        it('matches BigInt for 256 Fp2 products and dedicated squares', async function() {
            const edge = boundary.slice(0, 8).flatMap(a => boundary.slice(0, 8).map(b => [a, b]));
            const inputs = [...edge, ...Array.from({length:192}, (_, i) => [random(`real ${i}`), random(`imag ${i}`)])];
            for (let i = 0; i < inputs.length; ++i) {
                const a = inputs[i];
                const b = inputs[(i + 37) % inputs.length];
                const [product, square] = await math.extension(pair(a), pair(b));
                expect(pairInteger(product)).to.deep.equal(mul2(a, b));
                expect(pairInteger(square)).to.deep.equal(mul2(a, a));
            }
        });

        it('matches Noble root existence for 256 Fp2 inputs and checks every returned root independently', async function() {
            for (let i = 0; i < 256; ++i) {
                const randomPoint = [random(`sqrt real ${i}`), random(`sqrt imag ${i}`)];
                const a = i < 128 ? mul2(randomPoint, randomPoint) : randomPoint;
                let expected = true;
                try { bls.fields.Fp2.sqrt({ c0: a[0], c1: a[1] }); } catch { expected = false; }
                const [exists, root] = await math.root2(pair(a));
                expect(exists).to.equal(expected);
                if (exists) {
                    const decoded = pairInteger(root);
                    expect(mul2(decoded, decoded)).to.deep.equal(a);
                    expect(decoded.every(v => v < p)).to.equal(true);
                }
            }
        });

        describe('additional Ethereum sign vectors', function() {
            for (const [name, vector] of Object.entries(extra.sign)) {
                // A null output tests refusal to SIGN with an invalid secret key;
                // this verifier has no secret-key API. No such case is counted as a pass.
                if (vector.output === null) continue;
                it(name, async function() {
                    const pubkey = hex(bls.getPublicKey(BigInt(vector.input.privkey)));
                    expect(await verifier.verifySignature(vector.input.message, pubkey, vector.output)).to.equal(true);
                });
            }
        });

        it(`decodes all ${pointCorpus.size} distinct encoded points in Ethereum's additional vector families`, async function() {
            for (const encoded of pointCorpus) {
                const group = raw(encoded).length === 48 ? 'G1' : 'G2';
                let expected = !/^0xc0(?:00)+$/.test(encoded);
                let affine;
                try { affine = (group === 'G1' ? bls.G1.ProjectivePoint.fromHex(raw(encoded)) : bls.Signature.fromHex(raw(encoded))).toAffine(); }
                catch { expected = false; }
                const [valid, point] = await verifier[`decode${group}`](encoded);
                expect(valid).to.equal(expected);
                if (valid) {
                    const {x, y} = affine;
                    const coordinates = group === 'G1' ? [x, y] : [x.c0, x.c1, y.c0, y.c1];
                    expect(Array.from(point)).to.deep.equal(coordinates.flatMap(limbs));
                }
            }
        });

        describe('Ethereum hash-to-G2 coordinates as independent decoding vectors', function() {
            for (const [name, vector] of Object.entries(extra.hash_to_G2)) {
                it(name, async function() {
                    const x = vector.output.x.split(',').map(BigInt);
                    const y = vector.output.y.split(',').map(BigInt);
                    const flag = (y[1] !== 0n ? y[1] : y[0]) > p / 2n ? 0xa0 : 0x80;
                    const encoded = Buffer.from(x[1].toString(16).padStart(96, '0') + x[0].toString(16).padStart(96, '0'), 'hex');
                    encoded[0] |= flag;
                    const [valid, point] = await verifier.decodeG2(hex(encoded));
                    expect(valid).to.equal(true);
                    expect(Array.from(point)).to.deep.equal([...x, ...y].flatMap(limbs));
                });
            }
        });
    });
}
