pragma solidity 0.5.0;


import "../../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/token/RocketBETHTokenInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketNodeWatchtower - Handles watchtower (trusted) node functions
/// @author Jake Pospischil

contract RocketNodeWatchtower is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint;


    /*** Contracts **************/


    RocketBETHTokenInterface rocketBETHToken = RocketBETHTokenInterface(0);


    /*** Modifiers **************/


    /// @dev Only passes if the sender is a trusted node account
    modifier onlyTrustedNode() {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", msg.sender))), "Caller is not a trusted node account.");
        _;
    }


    /*** Constructor *************/


    /// @dev RocketNodeWatchtower constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        version = 1;
    }


    /*** Methods ****************/


    /// @dev Set a minipool to LoggedOut status
    /// @param _minipool The address of the minipool to log out
    function logoutMinipool(address _minipool) public onlyTrustedNode returns (bool) {
        // Log minipool out, reverts if not allowed
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        minipool.logoutMinipool();
        // Success
        return true;
    }


    /// @dev Set a minipool to Withdrawn status and mint RPB tokens to it
    /// @param _minipool The address of the minipool to withdraw
    /// @param _balance The balance of the minipool to mint as RPB tokens
    function withdrawMinipool(address _minipool, uint256 _balance) public onlyTrustedNode returns (bool) {
        // Get minipool contract
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        // Withdraw minipool, reverts if not allowed
        minipool.withdrawMinipool(_balance);
        // Get token amount to mint - subtract deposits withdrawn while staking
        uint256 stakingUserDepositsWithdrawn = minipool.getStakingUserDepositsWithdrawn();
        uint256 tokenAmount = (stakingUserDepositsWithdrawn > _balance) ? 0 : _balance.sub(stakingUserDepositsWithdrawn);
        // Mint RPB tokens to minipool
        if (tokenAmount > 0) {
            rocketBETHToken = RocketBETHTokenInterface(getContractAddress("rocketBETHToken"));
            rocketBETHToken.mint(_minipool, tokenAmount);
        }
        // Success
        return true;
    }


}
