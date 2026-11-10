import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pako from 'pako';
import { RocketPoolDeployer } from '../_helpers/deployer';
const { ethers } = require('../_utils/hardhat-runtime');

function domain(forkVersion) {
    const root = createHash('sha256').update(Buffer.concat([
        Buffer.from(forkVersion.slice(2), 'hex'), Buffer.alloc(28), Buffer.alloc(32),
    ])).digest();
    return `0x03000000${root.subarray(0, 28).toString('hex')}`;
}

export default function() {
    describe('Fresh deployment BLS verifier', function() {
        this.timeout(120000);

        for (const forkVersion of ['0x00000000', '0x10000910']) {
            it(`deploys and registers the verifier with genesis fork ${forkVersion}`, async function() {
                const [guardian, node] = await ethers.getSigners();
                const opts = forkVersion === '0x00000000' ? {} : { genesisForkVersion: forkVersion };
                const deployer = new RocketPoolDeployer(guardian, { logging: false, ...opts });
                await deployer.deploy();
                const storage = deployer.rocketStorageInstance;
                const entry = deployer.deployedContracts.blsDepositVerifier;
                assert(entry, 'The fresh deployment must include the BLS verifier');
                assert.equal(await storage['getAddress(bytes32)'](ethers.id('contract.addressblsDepositVerifier')), entry.address);
                assert.equal(await storage.getBool(ethers.solidityPackedKeccak256(['string', 'address'], ['contract.exists', entry.address])), true);
                const abi = JSON.parse(pako.inflate(Buffer.from(await storage.getString(ethers.id('contract.abiblsDepositVerifier')), 'base64'), { to: 'string' }));
                assert.equal(new ethers.Interface(abi).formatJson(), entry.instance.interface.formatJson());
                assert.equal(await entry.instance.depositDomain(), domain(forkVersion));
                assert.equal(entry.constructorArgs, ethers.AbiCoder.defaultAbiCoder().encode(['bytes4'], [forkVersion]));
                assert.equal(await deployer.deployedContracts.rocketDAOProtocolSettingsMegapool.instance.getStakeWithoutProofEnabled(), true);

                // Exercise the manager's registry lookup and challenge settlement on a fresh protocol.
                await deployer.bootstrapProtocolDAOSetting('rocketDAOProtocolSettingsNode', 'node.registration.enabled', true);
                await deployer.bootstrapProtocolDAOSetting('rocketDAOProtocolSettingsNode', 'node.deposit.enabled', true);
                await deployer.bootstrapProtocolDAOSetting('rocketDAOProtocolSettingsDeposit', 'deposit.enabled', true);
                await deployer.bootstrapProtocolDAOSetting('rocketDAOProtocolSettingsNetwork', 'network.reth.collateral.target', 0n);
                await (await deployer.deployedContracts.rocketNodeManager.instance.connect(node).registerNode('Australia/Brisbane')).wait();
                await (await deployer.deployedContracts.rocketDepositPool.instance.deposit({ value: ethers.parseEther('28') })).wait();
                const pubkey = `0x${'11'.repeat(48)}`;
                const signature = `0x${'00'.repeat(96)}`;
                const factory = deployer.deployedContracts.rocketMegapoolFactory.instance;
                const address = await factory.getExpectedAddress(node.address);
                const credentials = `0x01${'00'.repeat(11)}${address.slice(2)}`;
                const hash = (a, b) => ethers.sha256(ethers.concat([a, b]));
                const pubkeyRoot = hash(`0x${pubkey.slice(2, 66)}`, `0x${pubkey.slice(66)}${'00'.repeat(16)}`);
                const signatureRoot = hash(hash(ethers.ZeroHash, ethers.ZeroHash), hash(ethers.ZeroHash, ethers.ZeroHash));
                const amount = Buffer.alloc(32);
                amount.writeBigUInt64LE(1_000_000_000n);
                const depositRoot = hash(hash(pubkeyRoot, credentials), hash(amount, signatureRoot));
                await (await deployer.deployedContracts.rocketNodeDeposit.instance.connect(node).deposit(
                    ethers.parseEther('4'), false, pubkey, signature, depositRoot, { value: ethers.parseEther('4') },
                )).wait();
                await (await deployer.deployedContracts.rocketMegapoolManager.instance.connect(node).challengeInvalidSignature(address, 0n)).wait();
                const megapool = await ethers.getContractAt('RocketMegapoolDelegate', address);
                assert.equal((await megapool.getValidatorInfo(0n)).dissolved, true);
                assert.equal(await deployer.deployedContracts.rocketDepositPool.instance.getNodeCreditBalance(node.address), ethers.parseEther('3'));
            });
        }

        for (const genesisForkVersion of [undefined, '0x00', '0x0000000000', 'not-hex']) {
            it(`rejects an invalid explicit genesis fork version: ${genesisForkVersion}`, async function() {
                const [guardian] = await ethers.getSigners();
                assert.throws(() => new RocketPoolDeployer(guardian, { genesisForkVersion }), /genesisForkVersion must be a 4-byte hex value/);
            });
        }
    });
}
