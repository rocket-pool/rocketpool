pragma solidity ^0.4.2;

// Note: For some reason Migrations.sol needs to be in the root or they run everytime

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  modifier restricted() {
    assert(msg.sender == owner);
    _;
  }

  function Migrations() {
    owner = msg.sender;
  }

  function setCompleted(uint completed) restricted {
    last_completed_migration = completed;
  }

  function upgrade(address newAddress) restricted {
    Migrations upgraded = Migrations(newAddress);
    upgraded.setCompleted(last_completed_migration);
  }
}
