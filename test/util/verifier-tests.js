import { before, describe, it } from 'mocha';
import { printTitle } from '../_utils/formatting';
import { BeaconStateVerifier, BlockRootsMock } from '../_utils/artifacts';
import * as assert from 'assert';
import { shouldRevert } from '../_utils/testing';

const hre = require('hardhat');
const ethers = hre.ethers;

export default function() {
    describe('BeaconStateVerifier', () => {
        let owner,
            node,
            random;

        const farFutureEpoch = '18446744073709551615'.BN;

        // Setup
        before(async () => {
            [
                owner,
                node,
                random,
            ] = await ethers.getSigners();
        });

        it(printTitle('BeaconStateVerifier', 'Can verify validator with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();
            const blockRoots = await BlockRootsMock.deployed();

            const witnesses = [
                "0xdac075cf29676e5da6a30cb2c2fab90b2661e0b921c599b384399380ae9ab5ab",
                "0x0e79aad03eedbd72563db50550bb4066abe422407b4f6edddce9ae47ae87e15b",
                "0xebdf30ee31c84aea37daf85c65c905719264e88f506188080d60ee4beb0a6bca",
                "0x5a768ecc1dceded186826a1ca61d3959ae00465f36040b5ab02d6385dd6ee3fa",
                "0xf845231c6cca9c053e7830ad67927bd1a7364f3ee01b209456b24db1cc0fa98f",
                "0xc22694f4ffe34e813350e4fa3fedeeba4ad118860b84d45447701472606ec9d1",
                "0xdeb26ad6b414dd628c2b3392ebe5ba3d41fc7104e9b563fc154ea002a5a95e31",
                "0x2c22e317222b49318ab555c08b5e1d0e7e226515fe5e4797887c9b3a609700be",
                "0x9f80e99e8d1ba1b236466a03f3f59015dfabe3b6d35e566993dcc959e5824ee3",
                "0x73e279452b714583a3bf38d7c37e7ea275e28cd09abe60b11f941a12e64f4241",
                "0x28394ea21c79ad3b29d7fbb8b252d96150b211b60900517b012eed8afdb92a3f",
                "0xd7ec1342a5f06b9f60fdc95761c1dbdf01f31f5a28d326652dc2d9f879c297c8",
                "0x3823b57415d99bba0a6089026e692c2e9817c750e42e2517511ef5cf29070d05",
                "0x6a7886b5f8716f0e12f359d9025b51d764130c235b1115c9faee188cecc99df6",
                "0x3f7ec07faa352ae9d48eb0d48d65dc952eedf590bac5cff6484ae43504170716",
                "0x7be17af70e96360a0cde54b7eac5e0850e3a55f13995494006b052fda415fd9c",
                "0x50cb128a7ee63948dc8a8959609f24e19cc5d4dd48ba1d02bbb5fd61ed938dad",
                "0xff99326be45cd5416caf569a7562acaaf63a74d40b66d2f33a0738846e3366a5",
                "0x2fe03ec77e9a4653a29520320269fd0e44622efd0bd5c114a84b5ad3d476341f",
                "0xfb40cfe24c512cf2df420be3204f1c60e882d27f3ea63280c4b7c03c691a9a7f",
                "0xee50bfe01d2ea4bdf323be746769cc44afff7457aea078483382c5c33ddc4230",
                "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c",
                "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7",
                "0x31206fa80a50bb6abe29085058f16212212a60eec8f049fecb92d8c8e0a84bc0",
                "0x21352bfecbeddde993839f614c3dac0a3ee37543f9b412b16199dc158e23b544",
                "0x619e312724bb6d7c3153ed9de791d764a366b389af13c58bf8a8d90481a46765",
                "0x7cdd2986268250628d0c10e385c58c6191e6fbe05191bcc04f133f2cea72c1c4",
                "0x848930bd7ba8cac54661072113fb278869e07bb8587f91392933374d017bcbe1",
                "0x8869ff2c22b28cc10510d9853292803328be4fb0e80495e8bb8d271f5b889636",
                "0xb5fe28e79f1b850f8658246ce9b6a1e7b49fc06db7143e8fe0b4f2b0c5523a5c",
                "0x985e929f70af28d0bdd1a90a808f977f597c7c778c489e98d3bd8910d31ac0f7",
                "0xc6f67e02e6e4e1bdefb994c6098953f34636ba2b6ca20a4721d2b26a886722ff",
                "0x1c9a7e5ff1cf48b4ad1582d3f4e4a1004f3b20d8c5a2b71387a4254ad933ebc5",
                "0x2f075ae229646b6f6aed19a5e372cf295081401eb893ff599b3f9acc0c0d3e7d",
                "0x328921deb59612076801e8cd61592107b5c67c79b846595cc6320c395b46362c",
                "0xbfb909fdb236ad2411b4e4883810a074b840464689986c3f8a8091827e17c327",
                "0x55d8fb3687ba3ba49f342c77f5a1f89bec83d811446e1a467139213d640b6a74",
                "0xf7210d4f8e7e1039790e7bf4efa207555a10a6db1dd4b95da313aaa88b88fe76",
                "0xad21b516cbc645ffe34ab5de1c8aef8cd4e7f8d2b51e8e1456adc7563cda206f",
                "0xaf911d0000000000000000000000000000000000000000000000000000000000",
                "0xc6341f0000000000000000000000000000000000000000000000000000000000",
                "0x5aaa91f9944dda3f57d531e52f4127e134092e1e57350e5980dd654eee511488",
                "0xf99a074fcb6bb2a5b79601d206ab4700e897f0515626aaf30957aea3271b47b9",
                "0xdb4fe5420f82e43be50d01801979113267495914c66b45e9dff78c2ce393d27e",
                "0x4a1cdba46459907ad2e90e7781f1d6073cf605c7606449342b50a8eb9e5b137a",
                "0xfd0a4ea0112343eba60ae9a15bef34084e4df95fb5d34166a722f94edde023d2",
                "0xfcfc159f32c11dda7e315ff5d981cb1a247e4d26b3c2dc0f2aa3b842c5262a4f",
                "0xed688fdbfba04ce68e541cd09db8ea609fd951dd06b7dc171f337dcfb4e7774c",
                "0xd3b4850ac5f8ec9a4cc48295f972656a9b2ba8d35e665cd53c51a8bb448f9a63"
            ];

            const blockRoot = '0x26e397dd184ab83558a241a65847bf02406e26835b5a186fb0a2e05690958ad2';
            const slot = 11821055;
            await blockRoots.setBlockRoot(slot, blockRoot);

            const correctProof = {
                slot: slot,
                validatorIndex: 1060378,
                validator: {
                    pubkey: "0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c",
                    withdrawalCredentials: "0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f",
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
                slot: slot,
                validatorIndex: 1060378,
                validator: {
                    pubkey: "0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c",
                    withdrawalCredentials: "0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f",
                    effectiveBalance: 32000000000n,
                    slashed: false,
                    activationEligibilityEpoch: 246886n,
                    activationEpoch: 247130n,
                    exitEpoch: farFutureEpoch,
                    withdrawableEpoch: farFutureEpoch,
                },
                witnesses: [
                    '0x0000000000000000000000000000000000000000000000000000000000000000',
                    ...witnesses.slice(1)
                ],
            };

            const invalidCredentialsProof = {
                slot: slot,
                validatorIndex: 1060378,
                validator: {
                    pubkey: "0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c",
                    withdrawalCredentials: "0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293e",
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
                slot: 100000n,
                validatorIndex: 1060378,
                validator: {
                    pubkey: "0xb6544b67c27a9d9f460bd839b1a42d4edf4fedd2567a631ffe473f047acd539257dd326e5c969a08a5ae07db6fd8616c",
                    withdrawalCredentials: "0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f",
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
                beaconStateVerifier.verifyValidator(tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof'
            );
            assert.equal(await beaconStateVerifier.verifyValidator(incorrectProof), false);
            assert.equal(await beaconStateVerifier.verifyValidator(invalidCredentialsProof), false);
            assert.equal(await beaconStateVerifier.verifyValidator(correctProof), true);
        });

        it(printTitle('BeaconStateVerifier', 'Can verify withdrawal with state proof'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();
            const blockRoots = await BlockRootsMock.deployed();

            const witnesses = [
                "0x56ebcae55f5161bd71226301b4c751ef433864c820c8d09361ca1a74758dd72c", "0x162cc35aa31a7cf1790ca34860c7e7a63f1ab2529f66d99fa1a872aea0bcf529",
                "0x60df1c1e8c19fa3de668e029902080838b9dd7ab7fec07697512023010f94d8e", "0x2096b4b750bdd7e22648c95e859efbf140e3da2ddd9ccdd95f3eba97d8fc121b",
                "0x1000000000000000000000000000000000000000000000000000000000000000", "0x0000080000000000000000000000000000000000000000000000000000000000",
                "0x61f017d3d8dee5ba8c68636e51a096ed3f523bbf29209fdb88711ff91a013c00", "0x268dfefa9d9326b73496fceb1f0a5ef42c8186889d0e3afd04c96ea87438120c",
                "0xd85a7f6d61f27841b359f9d59db3adddd1208a0ea924ffbc9c229220f5a23c5a", "0x536d98837f2dd165a55d5eeae91485954472d56f246df256bf3cae19352a123c",
                "0xfd243838556ef257a4f3fd56272677a294c981de157694a3908dc9c08ca75d7a", "0xbd44a705c5063628996d4655f67571bcb9feadccab563f32235b08f8d52e9c7d",
                "0x6dd3b9955d892d92338b19976fd07084bfe88a76c3063482b7f30ee60feb2a58", "0x0a08a05a0b40226edaf0b2f1283eef98aca4b4cbe11e5a5add681fb78a15e807",
                "0x0000000000000000000000000000000000000000000000000000000000000000", "0xf5a5fd42d16a20302798ef6ed309979b43003d2320d9f0e8ea9831a92759fb4b",
                "0xa5f81459647ffebe8131ca4450ab282041ee9392788322920d6c6453e0d3703b",
                "0x7fa5e2df1bc7aa2f1530cd0bf1d3eab30ab12c4c1759429be374f5ed5bbbe43f", "0x409b0b10e9827ef913ad8961fc41b5dd5a01958c74e216fcde0d41e4738cd35c",
                "0xde3665f1b9e597580bb07de60cea574c5979a7e004d3b32e374a6350cce8fac5", "0xe7be85faefef9065463ec965fc39cfca593eb821ab779ea554f75524c9f60a5a",
                "0x9aab9f93f2e6677e57dd7050f31c9f98a35b8a43baca479a7bcb19c2eda73dee", "0x9e81de4708be5491b91ac6063e8ddd6fdd337ee4e0a0cba3d514645f096455c8",
                "0x66e126f270d3a2e25f45a07f376e99d8d337294ae07881402b4559f6ab4aa196", "0x1a49505aca09512fe47c707f8e904b230c91f691ec5e740d56b4f114897f41d3",
                "0x7bf09154ce4ecb3b37e79aab07747b10daebf5beef9ea8bf21dabf19c1882ef4", "0xc66785fa60eea935ffd8f68b04add1c62ef58e38e981a9531a7dd0278efcd26b",
                "0xf3c3f22873777b958507460c3537f0bd918c418e5addf3a03430cff26ee07d9e", "0x687f364236011235b2b4e40731cca0162739608af0294a6d4b576b5aecf51e57",
                "0x4fbd98fec8d190f77e452402b07aa8bf65847a2e2377f2e37065be5a9fa265e9", "0xd24aa06a0c8898472fa28ae9b982d7e392936e02d8cb53c48197e2edf3ba9ad5",
                "0xbef846d51e9bc2f7d07e91d4ef8c723e086a7df6e046fcea4bd477628c19e8a7", "0x542dea61bd1defaed4819d65ead85d75d6d940a3d2dded3749e725536acd8a4b",
                "0x3e177dc62135a265fafb6040763bf023d30f7540828b152d3473604a9e887eef", "0xa61ec140c4dee2bec895af537f2ef19376fac4ddb292ad7352809d7d5926461e",
                "0x2395c64f50239f14feea5dbe13c65d405e0d4be2d25e8995d8f64b94f83014fc",
                "0x032ffdac4b987092a708a481a6aa53c66aa874fe96a9f689031715ffa726fee4",
                "0xbe6d4ac575061b5182c9112451fdc189c2d3dc3a882b4c06c365e0acded0d600", "0x6cb1b243918374de6252a32aa24a34e0e40f3df71b7b51e6a59d0e99e9109d2d"
            ];

            const blockRoot = '0xe39be859f0aaa98d1c269252388115284366451b58ed082801593dbbfccd1876';
            const slot = 11834166;
            await blockRoots.setBlockRoot(slot, blockRoot);

            const correctProof = {
                slot: slot,
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses
            }

            const invalidProof = {
                slot: slot,
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
                    ...witnesses.slice(1)
                ]
            }

            const incorrectAmountProof = {
                slot: slot,
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165415n,
                },
                witnesses: witnesses
            }

            const tooOldProof = {
                slot: 100000n,
                withdrawalSlot: 11825974n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses
            }

            const tooOldWithdrawalProof = {
                slot: slot,
                withdrawalSlot: 1000000n,
                withdrawalNum: 0n,
                withdrawal: {
                    index: 89138507n,
                    validatorIndex: 1060378,
                    withdrawalCredentials: '0xb9d7934878b5fb9610b3fe8a5e441e8fad7e293f',
                    amountInGwei: 19165416n,
                },
                witnesses: witnesses
            }

            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(tooOldProof),
                'Accepted pre-electra proof',
                'Invalid proof'
            );
            await shouldRevert(
                beaconStateVerifier.verifyWithdrawal(tooOldWithdrawalProof),
                'Accepted pre-electra proof',
                'Invalid proof'
            );
            assert.equal(await beaconStateVerifier.verifyWithdrawal(invalidProof), false);
            assert.equal(await beaconStateVerifier.verifyWithdrawal(incorrectAmountProof), false);
            assert.equal(await beaconStateVerifier.verifyWithdrawal(correctProof), true);
        });

    });
}
