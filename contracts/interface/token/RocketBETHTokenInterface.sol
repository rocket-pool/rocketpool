pragma solidity 0.5.0;

import "./ERC20.sol";

contract RocketBETHTokenInterface is ERC20 {
    function mint(address _to, uint256 _amount) public returns (bool);
}
