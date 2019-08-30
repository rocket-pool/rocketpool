pragma solidity 0.5.8;

import "./ERC20.sol";

contract RocketETHTokenInterface is ERC20 {
    function mint(address _to, uint256 _amount) public returns (bool);
}
