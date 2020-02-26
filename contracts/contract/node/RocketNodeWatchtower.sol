pragma solidity 0.5.8;


import "../../RocketBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
import "../../interface/token/RocketETHTokenInterface.sol";
import "../../interface/utils/lists/AddressSetStorageInterface.sol";
import "../../lib/SafeMath.sol";


/// @title RocketNodeWatchtower - Handles watchtower (trusted) node functions
/// @author Jake Pospischil

contract RocketNodeWatchtower is RocketBase {


    /*** Libs  ******************/


    using SafeMath for uint;


    /*** Contracts **************/


    RocketETHTokenInterface rocketETHToken = RocketETHTokenInterface(0);
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);


    /*** Modifiers **************/


    /// @dev Only passes if the sender is a trusted node account
    modifier onlyTrustedNode() {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("node.trusted", msg.sender))), "Caller is not a trusted node account.");
        _;
    }


    /*** Events *****************/


    event PoolLoggedOut (
        address indexed _minipool,
        address indexed _from,
        uint256 created
    );

    event PoolWithdrawn (
        address indexed _minipool,
        address indexed _from,
        string  indexed _duration,
        uint256 balanceStart,
        uint256 balanceEnd,
        uint256 created
    );

    event WithdrawalKeyUpdated (
        bytes   indexed _withdrawalKey,
        bytes32 indexed _withdrawalCredentials,
        uint256 created
    );


    /*** Constructor ************/


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
        // Emit logout event
        emit PoolLoggedOut(_minipool, msg.sender, now);
        // Success
        return true;
    }


    /// @dev Set a minipool to Withdrawn status and mint rETH tokens to it
    /// @param _minipool The address of the minipool to withdraw
    /// @param _balance The balance of the minipool to mint as rETH tokens
    function withdrawMinipool(address _minipool, uint256 _balance) public onlyTrustedNode returns (bool) {
        // Get minipool contract
        RocketMinipoolInterface minipool = RocketMinipoolInterface(_minipool);
        // Withdraw minipool, reverts if not allowed
        minipool.withdrawMinipool(_balance);
        // Get token amount to mint - subtract deposits withdrawn while staking
        uint256 stakingUserDepositsWithdrawn = minipool.getStakingUserDepositsWithdrawn();
        uint256 tokenAmount = (stakingUserDepositsWithdrawn > _balance) ? 0 : _balance.sub(stakingUserDepositsWithdrawn);
        // Mint rETH tokens to minipool
        if (tokenAmount > 0) {
            rocketETHToken = RocketETHTokenInterface(getContractAddress("rocketETHToken"));
            rocketETHToken.mint(_minipool, tokenAmount);
        }
        // Emit withdrawal event
        emit PoolWithdrawn(_minipool, msg.sender, minipool.getStakingDurationID(), minipool.getStakingBalanceStart(), minipool.getStakingBalanceEnd(), now);
        // Success
        return true;
    }


    /// @dev Update the Rocket Pool withdrawal key & credentials
    /// @param _withdrawalKey The new withdrawal key to use
    /// @param _withdrawalCredentials The new withdrawal credentials to use
    function updateWithdrawalKey(bytes memory _withdrawalKey, bytes32 _withdrawalCredentials) public onlyTrustedNode returns (bool) {
        // Check withdrawal key length
        require(_withdrawalKey.length == 48, "Invalid withdrawal key length");
        // Initialise contracts
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Check node has not already approved update
        require(addressSetStorage.getIndexOf(keccak256(abi.encodePacked("withdrawalKey.update.approvals", _withdrawalKey, _withdrawalCredentials)), msg.sender) == -1, "Node has already approved this withdrawal key update.");
        // Approve update
        addressSetStorage.addItem(keccak256(abi.encodePacked("withdrawalKey.update.approvals", _withdrawalKey, _withdrawalCredentials)), msg.sender);
        // Complete update if approved by >= 50% of nodes
        uint256 trusteNodeCount = addressSetStorage.getCount(keccak256(abi.encodePacked("nodes.trusted")));
        if (addressSetStorage.getCount(keccak256(abi.encodePacked("withdrawalKey.update.approvals", _withdrawalKey, _withdrawalCredentials))).mul(2) >= trusteNodeCount) {
            // Set withdrawal key & credentials
            rocketStorage.setBytes(keccak256(abi.encodePacked("withdrawalKey")), _withdrawalKey);
            rocketStorage.setBytes32(keccak256(abi.encodePacked("withdrawalCredentials")), _withdrawalCredentials);
            // Emit update event
            emit WithdrawalKeyUpdated(_withdrawalKey, _withdrawalCredentials, now);
        }
        // Success
        return true;
    }


}
