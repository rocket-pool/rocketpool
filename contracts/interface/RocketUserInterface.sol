pragma solidity 0.4.23;


contract RocketUserInterface {
    /// @notice Send `msg.value ether` Eth from the account of `message.caller.address()`, to an account accessible only by Rocket Pool at `to.address()`.
    /// @dev Deposit to Rocket Pool, can be from a user or a partner on behalf of their user
    /// @param _partnerUserAddress The address of the user whom the deposit belongs too
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _poolStakingTimeID The ID that determines which pool the user intends to join based on the staking time of that pool (3 months, 6 months etc)
    function userDepositFromPartner(address _partnerUserAddress, address _partnerAddress, string _poolStakingTimeID) public payable returns(bool);
    /// @notice Withdraw ether from Rocket Pool via a 3rd party partner
    /// @dev A Rocket Pool 3rd party partner withdrawing their users deposit
    /// @param _miniPoolAddress The address of the mini pool they wish to withdraw from.
    /// @param _amount The amount in Wei to withdraw, passing 0 will withdraw the users whole balance.
    /// @param _partnerAddress The address of the registered 3rd party partner whom is in control of the supplid user account that the deposit belongs too
    /// @param _partnerUserAddress The address of the registered 3rd party partners user
    function userWithdrawFromPartner(address _miniPoolAddress, uint256 _amount, address _partnerAddress, address _partnerUserAddress) public returns(bool);
}