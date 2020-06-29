pragma solidity 0.6.10;

// SPDX-License-Identifier: GPL-3.0-only

// Note: For some reason Migrations.sol needs to be in the root or they run everytime

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  modifier isOwner(address _address) {
    require(_address == owner);
    _;
  }

  constructor() public {
    owner = msg.sender;
  }

  function setCompleted(uint completed) public isOwner(msg.sender) {
    last_completed_migration = completed;
  }

  function upgrade(address newAddress) public isOwner(msg.sender) {
    Migrations upgraded = Migrations(newAddress);
    upgraded.setCompleted(last_completed_migration);
  }
}
