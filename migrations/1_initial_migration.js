var Migrations = artifacts.require("./contract/Migrations.sol");

module.exports = function(deployer) {
  deployer.deploy(Migrations);
};
