pragma solidity 0.4.18;

// Note: For some reason Migrations.sol needs to be in the root or they run everytime

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  modifier restricted() {
    assert(msg.sender == owner);
    _;
  }

  function Migrations() public {
    owner = msg.sender;
  }

  function setCompleted(uint completed) public restricted {
    last_completed_migration = completed;
  }

  function upgrade(address newAddress) public restricted {
    Migrations upgraded = Migrations(newAddress);
    upgraded.setCompleted(last_completed_migration);
  }
}
