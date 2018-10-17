pragma solidity 0.4.24; 


// Our group contract interface
contract RocketGroupContractInterface {
    // Getters
    function getFeePerc() public view returns(uint256);
    function hasDepositor(address _depositorAddress) public view returns (bool);
    function hasWithdrawer(address _withdrawerAddress) public view returns (bool);
}
