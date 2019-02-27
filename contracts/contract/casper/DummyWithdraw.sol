pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/token/RocketBETHTokenInterface.sol";


contract DummyWithdraw is RocketBase {


    /*** Contracts **************/


    RocketBETHTokenInterface rocketBETHToken = RocketBETHTokenInterface(0);


    /*** Events *****************/


    /// @dev Validator withdrawal
    event Withdrawal(address indexed to, uint256 amount, uint256 time);


    /*** Methods ****************/


    /// @dev DummyWithdraw constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {}


    /// @dev Default payable function
    function() external payable {}


    /// @dev Withdraw from Casper
    /// @dev _to The address to mint RPB tokens to
    /// @dev _amount The amount of ether to transfer to the RPB contract and mint tokens for
    function withdraw(address payable _to, uint256 _amount) external onlySuperUser {
        // Check arguments
        require(_to != address(0x0), "Invalid to address");
        require(_amount > 0, "Invalid withdrawal amount");
        require(_amount <= address(this).balance, "Insufficient contract balance for withdrawal");
        // Mint RPB tokens to address
        rocketBETHToken = RocketBETHTokenInterface(getContractAddress("rocketBETHToken"));
        rocketBETHToken.mint(_to, _amount);
        // Transfer withdrawal amount to RPB contract
        address(rocketBETHToken).transfer(_amount);
        // Emit withdrawal event
        emit Withdrawal(_to, _amount, now);
    }


}
