import { printTitle } from '../_utils/formatting';
import { BeaconStateVerifier, BlockRootsMock } from '../_utils/artifacts';
import * as assert from 'assert';

export default function() {
    contract.only('BeaconStateVerifier', async (accounts) => {

        const farFutureEpoch = '18446744073709551615'.BN;

        // Accounts
        const [
            owner,
            node,
            random
        ] = accounts;

        // Setup
        before(async () => {
        });


        it(printTitle('BeaconStateVerifier', 'Can verify withdrawal_epoch on validator'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();
            const blockRoots = await BlockRootsMock.deployed();

            const proof = [
                "0xffffffffffffffff000000000000000000000000000000000000000000000000", "0xd36369eb7ffeceacc83d0161d3cce7d8aa1c8e71d4801a0fae7fc5e81d4fe646",
                "0xa0bced902ed1d2f2040c17ed0ca3f2c74725266f51686074fc9d7b3582afdb0e", "0x8abe1b18eaaa49e04e986bd5fb44ad90c08d1df57eabea9e26796a961fe1b762",
                "0x972d643714dddffdde5e935588249fb04be277ad32fa43aa72e6325c4d826b02", "0xa73fde132b956a530446ee8b3e3eda7f1cf2ecdd7b77cbebe74720bd5d507018",
                "0x797802b8fb8765a4453bb8e57f88e56a7384d9f8f2c12bf3d391f8c6b8f1b777", "0x90c14e71e4b5219f2a9a7af09dc2e12816d17e61fe496037915abab076bf4936",
                "0xabf67b0094566967984cc1e541465ffb493fb2a774ee9fc5f8d622f6fc727dee", "0x0c5efab4b9107156baad254d93611106b53d7f8dff350c3074a1b1de49d3739d",
                "0x40b6ae6d5c4a6ec795216c23cc3d5f248d4ef0a3ee5cd28b1f21870ef220f436", "0x052d6eb18f2273ca94e01a0e0d5b83f18bbf1fdd21d33371535cc02955f90dd5",
                "0x35c5eee1ce1a71941ea3c634d51e758862662bd6a7930dc782cce1d910c842de", "0x911d546506255f2b25b692d07296250d5e9d629e13f4be6fad7ea81afe36cdef",
                "0x864281fd8bfadbb9703fdc9222b60bf7f05ccd0949e8ac9f55a969a1f9e1f0d5", "0x2eb75ca5e4bd323be9fd8c3169a215ad8b5a92cfd523189f02d3b9d67c819ad1",
                "0xf1de8416a99820cc4b8c171b65bfbd0e91ad943892c3aaa6136e8079cf7bbf7e", "0xd63689dc41cf609a5da18a9c17cc9cdf25ad8362049265160cd548420e16261c",
                "0xfcd02046c251c4127f8dcc11689a84684ab8f1b0e3ba9c37e8db97843a204530", "0xa3e0d701f848796c7ccb049bd3e68f383e36ca46350629e5a94cc9b358f18636",
                "0x6e0377ad2b0b05b70f678dfd941d8de3f2e78233cd016b13a930954aaf452d28", "0xb1b67762d198c91ccc535b80ff45e5e96069d482502a0056e79d722eaa67fc2d",
                "0xcaf28f9127023bf1cac976418fc7b1e77fa3f3244b08e052e3c8377f6eb08e46", "0x64be0aa128a085f30cf6f8ab1addae891a6f88d2605904c1e7143ca01d876eee",
                "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c", "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7", "0x31206fa80a50bb6abe29085058f16212212a60eec8f049fecb92d8c8e0a84bc0",
                "0x21352bfecbeddde993839f614c3dac0a3ee37543f9b412b16199dc158e23b544", "0x619e312724bb6d7c3153ed9de791d764a366b389af13c58bf8a8d90481a46765",
                "0x7cdd2986268250628d0c10e385c58c6191e6fbe05191bcc04f133f2cea72c1c4", "0x848930bd7ba8cac54661072113fb278869e07bb8587f91392933374d017bcbe1",
                "0x8869ff2c22b28cc10510d9853292803328be4fb0e80495e8bb8d271f5b889636", "0xb5fe28e79f1b850f8658246ce9b6a1e7b49fc06db7143e8fe0b4f2b0c5523a5c",
                "0x985e929f70af28d0bdd1a90a808f977f597c7c778c489e98d3bd8910d31ac0f7", "0xc6f67e02e6e4e1bdefb994c6098953f34636ba2b6ca20a4721d2b26a886722ff",
                "0x1c9a7e5ff1cf48b4ad1582d3f4e4a1004f3b20d8c5a2b71387a4254ad933ebc5", "0x2f075ae229646b6f6aed19a5e372cf295081401eb893ff599b3f9acc0c0d3e7d",
                "0x328921deb59612076801e8cd61592107b5c67c79b846595cc6320c395b46362c", "0xbfb909fdb236ad2411b4e4883810a074b840464689986c3f8a8091827e17c327",
                "0x55d8fb3687ba3ba49f342c77f5a1f89bec83d811446e1a467139213d640b6a74", "0xf7210d4f8e7e1039790e7bf4efa207555a10a6db1dd4b95da313aaa88b88fe76",
                "0xad21b516cbc645ffe34ab5de1c8aef8cd4e7f8d2b51e8e1456adc7563cda206f", "0xaee9170000000000000000000000000000000000000000000000000000000000",
                "0xc676190000000000000000000000000000000000000000000000000000000000", "0x9e726312e7accc39bdabc250868443dfa3e3e3c1e8afed5b321ff95f3b3e5953",
                "0x807048ee3da1192d1a3242119526a1a0619879f4479311056ac66d41ce02dbbc", "0xef8173f1199d3fcd5682c53175d32fb31455943f05752029ba5eec15786f58ce",
                "0x4fe1a97f920c8ecb59d4baf2fcf695ac9c5499dbc40b17223414189fe92e7a1c", "0x11835bc12952a49e5883d2e253de8d7ddc2dfbc37304cf8b7549a4639adfeafc",
                "0xbccefc0276b6b53a3f5953bfb5a2b85a58862787deafaff3abd7ade9b72dfeec", "0xb57b89920e74352b7ba8e0a2ef2bb22d9b1e800543da08b51a26e5963b5f6137"
            ];

            const blockRoot = '0x2d35f6917626ce36097c7fe3f6bc8ae08de2c37aa21218c0e8c11e989bed80e3'
            const slot = 9882147;
            await blockRoots.setBlockRoot(slot, blockRoot);

            const result = await beaconStateVerifier.verifyExit(405782, farFutureEpoch, slot, proof);
            assert.equal(result, true, "Verification failed");
        });


        it(printTitle('BeaconStateVerifier', 'Can verify pubkey/withdrawal_credentials on validator'), async () => {
            const beaconStateVerifier = await BeaconStateVerifier.deployed();
            const blockRoots = await BlockRootsMock.deployed();

            const proof = [
                "0x19327cb9763c96e00332bde93bdbb1032c4b796dda73e515c8c5f7ede9a419be",
                "0xf7002d928230a591b4a878899957e68a3d5cd73f487a8c1a5140319ca4c6c874", "0x8abe1b18eaaa49e04e986bd5fb44ad90c08d1df57eabea9e26796a961fe1b762",
                "0x972d643714dddffdde5e935588249fb04be277ad32fa43aa72e6325c4d826b02", "0xa73fde132b956a530446ee8b3e3eda7f1cf2ecdd7b77cbebe74720bd5d507018",
                "0x797802b8fb8765a4453bb8e57f88e56a7384d9f8f2c12bf3d391f8c6b8f1b777", "0x90c14e71e4b5219f2a9a7af09dc2e12816d17e61fe496037915abab076bf4936",
                "0xabf67b0094566967984cc1e541465ffb493fb2a774ee9fc5f8d622f6fc727dee", "0x0c5efab4b9107156baad254d93611106b53d7f8dff350c3074a1b1de49d3739d",
                "0x40b6ae6d5c4a6ec795216c23cc3d5f248d4ef0a3ee5cd28b1f21870ef220f436", "0x052d6eb18f2273ca94e01a0e0d5b83f18bbf1fdd21d33371535cc02955f90dd5",
                "0x35c5eee1ce1a71941ea3c634d51e758862662bd6a7930dc782cce1d910c842de", "0x911d546506255f2b25b692d07296250d5e9d629e13f4be6fad7ea81afe36cdef",
                "0x864281fd8bfadbb9703fdc9222b60bf7f05ccd0949e8ac9f55a969a1f9e1f0d5", "0x2eb75ca5e4bd323be9fd8c3169a215ad8b5a92cfd523189f02d3b9d67c819ad1",
                "0xf1de8416a99820cc4b8c171b65bfbd0e91ad943892c3aaa6136e8079cf7bbf7e", "0xd63689dc41cf609a5da18a9c17cc9cdf25ad8362049265160cd548420e16261c",
                "0xfcd02046c251c4127f8dcc11689a84684ab8f1b0e3ba9c37e8db97843a204530", "0xa3e0d701f848796c7ccb049bd3e68f383e36ca46350629e5a94cc9b358f18636",
                "0x6e0377ad2b0b05b70f678dfd941d8de3f2e78233cd016b13a930954aaf452d28", "0xb1b67762d198c91ccc535b80ff45e5e96069d482502a0056e79d722eaa67fc2d",
                "0xcaf28f9127023bf1cac976418fc7b1e77fa3f3244b08e052e3c8377f6eb08e46", "0x64be0aa128a085f30cf6f8ab1addae891a6f88d2605904c1e7143ca01d876eee",
                "0x8a8d7fe3af8caa085a7639a832001457dfb9128a8061142ad0335629ff23ff9c", "0xfeb3c337d7a51a6fbf00b9e34c52e1c9195c969bd4e7a0bfd51d5c5bed9c1167",
                "0xe71f0aa83cc32edfbefa9f4d3e0174ca85182eec9f3a09f6a6c0df6377a510d7", "0x31206fa80a50bb6abe29085058f16212212a60eec8f049fecb92d8c8e0a84bc0",
                "0x21352bfecbeddde993839f614c3dac0a3ee37543f9b412b16199dc158e23b544", "0x619e312724bb6d7c3153ed9de791d764a366b389af13c58bf8a8d90481a46765",
                "0x7cdd2986268250628d0c10e385c58c6191e6fbe05191bcc04f133f2cea72c1c4", "0x848930bd7ba8cac54661072113fb278869e07bb8587f91392933374d017bcbe1",
                "0x8869ff2c22b28cc10510d9853292803328be4fb0e80495e8bb8d271f5b889636", "0xb5fe28e79f1b850f8658246ce9b6a1e7b49fc06db7143e8fe0b4f2b0c5523a5c",
                "0x985e929f70af28d0bdd1a90a808f977f597c7c778c489e98d3bd8910d31ac0f7", "0xc6f67e02e6e4e1bdefb994c6098953f34636ba2b6ca20a4721d2b26a886722ff",
                "0x1c9a7e5ff1cf48b4ad1582d3f4e4a1004f3b20d8c5a2b71387a4254ad933ebc5", "0x2f075ae229646b6f6aed19a5e372cf295081401eb893ff599b3f9acc0c0d3e7d",
                "0x328921deb59612076801e8cd61592107b5c67c79b846595cc6320c395b46362c", "0xbfb909fdb236ad2411b4e4883810a074b840464689986c3f8a8091827e17c327",
                "0x55d8fb3687ba3ba49f342c77f5a1f89bec83d811446e1a467139213d640b6a74", "0xf7210d4f8e7e1039790e7bf4efa207555a10a6db1dd4b95da313aaa88b88fe76",
                "0xad21b516cbc645ffe34ab5de1c8aef8cd4e7f8d2b51e8e1456adc7563cda206f", "0xaee9170000000000000000000000000000000000000000000000000000000000",
                "0xc676190000000000000000000000000000000000000000000000000000000000", "0x9e726312e7accc39bdabc250868443dfa3e3e3c1e8afed5b321ff95f3b3e5953",
                "0x807048ee3da1192d1a3242119526a1a0619879f4479311056ac66d41ce02dbbc", "0xef8173f1199d3fcd5682c53175d32fb31455943f05752029ba5eec15786f58ce",
                "0x4fe1a97f920c8ecb59d4baf2fcf695ac9c5499dbc40b17223414189fe92e7a1c", "0x11835bc12952a49e5883d2e253de8d7ddc2dfbc37304cf8b7549a4639adfeafc",
                "0xbccefc0276b6b53a3f5953bfb5a2b85a58862787deafaff3abd7ade9b72dfeec", "0xb57b89920e74352b7ba8e0a2ef2bb22d9b1e800543da08b51a26e5963b5f6137"
            ];

            const blockRoot = '0x2d35f6917626ce36097c7fe3f6bc8ae08de2c37aa21218c0e8c11e989bed80e3'
            const slot = 9882147;
            await blockRoots.setBlockRoot(slot, blockRoot);

            const pubkey = '0xac40921dc9996570db336ef7d6a8cece00a0363c67d13bbdcb0f995c8d50c9b733a5c568f8fcfdc768137d1041ab0f23';
            const withdrawalCredentials = '0x010000000000000000000000a328075616c6351790a9ac1391c4b7b2c1dbf728';

            const result = await beaconStateVerifier.verifyValidator(405782, pubkey, withdrawalCredentials, slot, proof);
            assert.equal(result, true, "Verification failed");
        });

    });
}
