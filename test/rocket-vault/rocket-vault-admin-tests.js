import { printTitle, assertThrows, soliditySha3 } from "../utils";
import { RocketVault, RocketRole } from "../artifacts";
import { scenarioAddAccount, scenarioDepositEnabling, sceanarioWithdrawalsEnabling } from "./rocket-vault-scenarios";

export default function({owner}){

    contract("RocketVault - Admininstration", async (accounts) => {
        let rocketVault;

        before(async () => {
            rocketVault = await RocketVault.deployed();
        });

        // As an owner I must be able to add a non-token account to the vault.
        it(printTitle("owner", "can add a non-token account to the vault"), async () => {
            await scenarioAddAccount({
                accountName: soliditySha3("owner.nontoken"),
                ownerAddress: owner,
                tokenContractAddress: 0x0
            });
        });

        // As an owner I must be able to add a token account to the vault.
       it(printTitle("owner", "can add a token account to the vault"), async () => { 
            await scenarioAddAccount({
                accountName: soliditySha3("owner.token"),
                ownerAddress: owner,
                tokenContractAddress: 0xa917e0023dae346fe728ae51376a430df1ea9335 // random address
            });
        });

        // As an owner I must not be able to add an account without a name.
       it(printTitle("owner", "cannot add an account without a name"), async () => {
            let promise = scenarioAddAccount({
                accountName: "", // empty account name is invalid
                ownerAddress: owner
            });
            await assertThrows(promise);
        });

        // As an owner I must not be able to add an account that already exists.
       it(printTitle("owner", "cannot add an account that already exists"), async () => {
            const existingAccountName = soliditySha3("owner.alreadyExists");

            // add an account with a specific name
            await rocketVault.setAccountAdd(existingAccountName, 0x0, {from: owner});

            // try to add another with the same name
            let promise = scenarioAddAccount({
                accountName: existingAccountName,
                ownerAddress: owner
            });

            // should fail
            await assertThrows(promise);
        });

       it(printTitle("owner", "can disable/enable account deposits"), async () => {
            // create an admin to become owner of the account            
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account by the admin account
            const accountName = soliditySha3("owner.deposits.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner});

            // test owner can disable/enable account deposits of an account not owned by them
            await scenarioDepositEnabling({
                accountName: accountName,
                accountToTestEnabling: owner
            });
        });

       it(printTitle("owner", "can disable/enable account withdrawals"), async () => {
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account owned by some account owner
            const accountName = soliditySha3("owner.withdrawals.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner});

            // test owner can disable/enable account withdrawals of an account not owned by them 
            await sceanarioWithdrawalsEnabling({
                accountName: accountName,
                accountToTestEnabling: owner
            });
        });

        // As an admin I must be able to add a non-token account to the vault.
       it(printTitle("admin", "can add a non-token account to the vault"), async () => {
            const rocketRole = await RocketRole.deployed();
            const adminAddress = accounts[1];
            await rocketRole.adminRoleAdd("admin", adminAddress, {from: owner});

            await scenarioAddAccount({
                accountName: soliditySha3("admin.nontoken"),
                ownerAddress: adminAddress,
                tokenContractAddress: 0x0
            });
        });

         // As an admin I must be able to add a token account to the vault.
        it(printTitle("admin", "can add a token account to the vault"), async () => {
            const rocketRole = await RocketRole.deployed();
            const adminAddress = accounts[1];
            await rocketRole.adminRoleAdd("admin", adminAddress, {from: owner});

            await scenarioAddAccount({
                accountName: soliditySha3("admin.token"),
                ownerAddress: adminAddress,
                tokenContractAddress: 0xa917e0023dae346fe728ae51376a430df1ea9335 // random address
            });
        });

        // As an admin I must not be able to add an account without a name.
       it(printTitle("admin", "cannot add an account without a name"), async () => {
            const rocketRole = await RocketRole.deployed();
            const adminAddress = accounts[1];
            await rocketRole.adminRoleAdd("admin", adminAddress, {from: owner});

            let promise = scenarioAddAccount({
                accountName: "", // empty account name is invalid
                ownerAddress: adminAddress
            });
            await assertThrows(promise);
        });

        // As an admin I must not be able to add an account that already exists.
       it(printTitle("admin", "cannot add an account that already exists"), async () => {
            const rocketRole = await RocketRole.deployed();
            const adminAddress = accounts[1];
            await rocketRole.adminRoleAdd("admin", adminAddress, {from: owner});

            // add an account with a specific name
            const existingAccountName = soliditySha3("admin.alreadyExists");
            await rocketVault.setAccountAdd(existingAccountName, 0x0, {from: owner});

            // try to add another with the same name
            let promise = scenarioAddAccount({
                accountName: existingAccountName,
                ownerAddress: adminAddress
            });

            // should fail
            await assertThrows(promise);
        });

        // As an account owner I must be able to enable/disable account deposits
       it(printTitle("account owner", "can disable/enable account deposits"), async () => {
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account, accountOwner must be admin to add an account
            const accountName = soliditySha3("accountowner.deposit.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner});            

            // remove admin role so we are testing account ownership only
            await rocketRole.adminRoleRemove("admin", accountOwner, {from: owner});

            // test that account owner can enable/disable deposits of their account
            await scenarioDepositEnabling({
                accountName: accountName,
                accountToTestEnabling: accountOwner
            });
        });

        // As an account owner I must be able to enable/disable account withdrawals
       it(printTitle("account owner", "can disable/enable account withdrawals"), async () => {
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account, accountOwner must be admin to add an account
            const accountName = soliditySha3("accountowner.withdrawal.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner});            

            // remove admin role so we are testing account ownership only
            await rocketRole.adminRoleRemove("admin", accountOwner, {from: owner});

             // test account owner can disable/enable account withdrawals of their account
             await sceanarioWithdrawalsEnabling({
                accountName: accountName,
                accountToTestEnabling: accountOwner
            });
        });

        // As a random account I must not be able to add an account to the vault
       it(printTitle("random account", "cannot add an account to the vault"), async () => {
            let randomAccount = accounts[2];
            let promise = scenarioAddAccount({
                accountName: soliditySha3("random.nontoken"),
                ownerAddress: randomAccount,
                tokenContractAddress: 0x0
            });

            // should fail
            await assertThrows(promise);
        });

        // As a random account I must not be able to add a token account to the vault
       it(printTitle("random account", "cannot add a token account to the vault"), async () => {
            let randomAccount = accounts[2];
            let promise = scenarioAddAccount({
                accountName: soliditySha3("random.token"),
                ownerAddress: randomAccount,
                tokenContractAddress: 0xa917e0023dae346fe728ae51376a430df1ea9335
            });

            // should fail
            await assertThrows(promise);
        });

        // As a random account I cannot enable/disable account deposits
       it(printTitle("random account", "cannot disable/enable account deposits"), async () => {            
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account, accountOwner must be admin to add an account
            const accountName = soliditySha3("random.deposit.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner}); 

            let randomAccount = accounts[2];

            // test random account cannot disable/enable account deposits of an account
            let promise = scenarioDepositEnabling({
                accountName: accountName,
                accountToTestEnabling: randomAccount
            });

            await assertThrows(promise);
        });

        // As a random account I cannot enable/disable account withdrawals
       it(printTitle("random account", "cannot disable/enable account withdrawals"), async () => {            
            const rocketRole = await RocketRole.deployed();
            const accountOwner = accounts[1];
            await rocketRole.adminRoleAdd("admin", accountOwner, {from: owner});

            // add an account, accountOwner must be admin to add an account
            const accountName = soliditySha3("random.withdrawals.enabling");
            await rocketVault.setAccountAdd(accountName, 0x0, {from: accountOwner}); 

            let randomAccount = accounts[2];

            // test random account cannot disable/enable account withdrawals of an account
            let promise = sceanarioWithdrawalsEnabling({
                accountName: accountName,
                accountToTestEnabling: randomAccount
            });

            await assertThrows(promise);
        });

    });

};

