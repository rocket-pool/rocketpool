pragma solidity 0.5.8;


// Interfaces
import "./RocketMinipoolBase.sol";
import "../../interface/settings/RocketMinipoolSettingsInterface.sol";
import "../../interface/node/RocketNodeContractInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title A minipool under the main RocketPool, all major logic is contained within the RocketMinipoolDelegate contracts which are upgradable when minipools are deployed
/// @author David Rugendyke

contract RocketMinipool is RocketMinipoolBase {


    /*** Libs  *****************/

    using SafeMath for uint;


    /*** Events ****************/


    event DepositReceived (
        address indexed _fromAddress,                           // From address
        uint256 amount,                                         // Amount of the deposit
        uint256 created                                         // Creation timestamp
    );


    /*** Methods *************/
   
    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    /// @param _nodeOwner The address of the nodes etherbase account that owns this minipool.
    /// @param _durationID Staking duration ID (eg 3m, 6m etc)
    /// @param _validatorPubkey The validator's pubkey to be submitted to the casper deposit contract for the deposit
    /// @param _validatorSignature The validator's signature to be submitted to the casper deposit contract for the deposit
    /// @param _depositEther Ether amount deposited by the node owner
    /// @param _depositRPL RPL amount deposited by the node owner
    /// @param _trusted Is the node trusted at the time of minipool creation?
    constructor(address _rocketStorageAddress, address _nodeOwner, string memory _durationID, bytes memory _validatorPubkey, bytes memory _validatorSignature, uint256 _depositEther, uint256 _depositRPL, bool _trusted) RocketMinipoolBase(_rocketStorageAddress) public {
        // Get minipool settings
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Set the initial status
        status.current = 0;
        status.time = now;
        status.block = block.number;
        // Set the node owner and contract address
        node.owner = _nodeOwner;
        node.depositEther = _depositEther;
        node.depositRPL = _depositRPL;
        node.trusted = _trusted;
        node.contractAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("node.contract", _nodeOwner)));
        // Initialise the node contract
        rocketNodeContract = RocketNodeContractInterface(node.contractAddress);
        // Set the initial staking properties
        staking.id = _durationID;
        staking.duration = rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        staking.validatorPubkey = _validatorPubkey;
        staking.validatorSignature = _validatorSignature;
        // Set the user deposit capacity
        userDepositCapacity = rocketMinipoolSettings.getMinipoolLaunchAmount().sub(_depositEther);
    }


    // Payable
    
    /// @dev Fallback function where our deposit + rewards will be received after requesting withdrawal from Casper
    function() external payable { 
        // Log the deposit received
        emit DepositReceived(msg.sender, msg.value, now);       
    }


    /*** NODE ***********************************************/

    // Getters

    /// @dev Gets the node contract address
    function getNodeOwner() public view returns(address) {
        return node.owner;
    }

    /// @dev Gets the node contract address
    function getNodeContract() public view returns(address) {
        return node.contractAddress;
    }

    /// @dev Gets the amount of ether the node owner must deposit
    function getNodeDepositEther() public view returns(uint256) {
        return node.depositEther;
    }
    
    /// @dev Gets the amount of RPL the node owner must deposit
    function getNodeDepositRPL() public view returns(uint256) {
        return node.depositRPL;
    }

    /// @dev Gets the node's trusted status (at the time of minipool creation)
    function getNodeTrusted() public view returns(bool) {
        return node.trusted;
    }

    /// @dev Gets whether the node operator's deposit currently exists
    function getNodeDepositExists() public view returns(bool) {
        return node.depositExists;
    }

    /// @dev Gets the node operator's ether balance
    function getNodeBalance() public view returns(uint256) {
        return node.balance;
    }


    // Methods

    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable isNodeContract(msg.sender) returns(bool) {
        // Will throw if conditions are not met in delegate
        (bool success,) = getContractAddress("rocketMinipoolDelegateNode").delegatecall(abi.encodeWithSignature("nodeDeposit()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Withdraw ether / rpl deposit from the minipool if initialised, timed out or withdrawn
    function nodeWithdraw() public isNodeContract(msg.sender) returns(bool) {
        // Will throw if conditions are not met in delegate
        (bool success,) = getContractAddress("rocketMinipoolDelegateNode").delegatecall(abi.encodeWithSignature("nodeWithdraw()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /*** DEPOSITS ***********************************************/

    // Getters

    /// @dev Returns the deposit count for this pool
    function getDepositCount() public view returns(uint256) {
        return depositIDs.length;
    }

    /// @dev Returns true if the deposit is in this pool
    function getDepositExists(bytes32 _depositID) public view returns(bool) {
        return (deposits[_depositID].exists && deposits[_depositID].balance > 0);
    }

    /// @dev Returns the deposit's user ID
    function getDepositUserID(bytes32 _depositID) public view returns(address) {
        return deposits[_depositID].userID;
    }

    /// @dev Returns the deposit's group ID
    function getDepositGroupID(bytes32 _depositID) public view returns(address) {
        return deposits[_depositID].groupID;
    }

    /// @dev Returns the balance of the deposit
    function getDepositBalance(bytes32 _depositID) public view returns(uint256) {
        return deposits[_depositID].balance;
    }

    /// @dev Returns the amount of the deposit withdrawn as RPB
    function getDepositStakingTokensWithdrawn(bytes32 _depositID) public view returns(uint256) {
        return deposits[_depositID].stakingTokensWithdrawn;
    }


    // Methods

    /// @dev Deposit a user's ether to this contract. Will register the deposit if it doesn't exist in this contract already.
    /// @param _depositID The ID of the deposit
    /// @param _userID New user address
    /// @param _groupID The 3rd party group the user belongs to
    function deposit(bytes32 _depositID, address _userID, address _groupID) public payable onlyLatestContract("rocketDepositQueue") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("deposit(bytes32,address,address)", _depositID, _userID, _groupID));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Refund a deposit and remove it from this contract (if minipool stalled).
    /// @param _depositID The ID of the deposit
    /// @param _refundAddress The address to refund the deposit to
    function refund(bytes32 _depositID, address _refundAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("refund(bytes32,address)", _depositID, _refundAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Withdraw some amount of a deposit as RPB tokens, forfeiting rewards for that amount, and remove it if the entire deposit is withdrawn (if minipool staking).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawnAmount The amount of the deposit withdrawn
    /// @param _tokenAmount The amount of RPB tokens withdrawn
    /// @param _withdrawnAddress The address the deposit was withdrawn to
    function withdrawStaking(bytes32 _depositID, uint256 _withdrawnAmount, uint256 _tokenAmount, address _withdrawnAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("withdrawStaking(bytes32,uint256,uint256,address)", _depositID, _withdrawnAmount, _tokenAmount, _withdrawnAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /// @dev Withdraw a deposit as RPB tokens and remove it from this contract (if minipool withdrawn).
    /// @param _depositID The ID of the deposit
    /// @param _withdrawalAddress The address to withdraw the deposit to
    function withdraw(bytes32 _depositID, address _withdrawalAddress) public onlyLatestContract("rocketDeposit") returns(bool) {
        // Will throw if conditions are not met in delegate or call fails
        (bool success,) = getContractAddress("rocketMinipoolDelegateDeposit").delegatecall(abi.encodeWithSignature("withdraw(bytes32,address)", _depositID, _withdrawalAddress));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


    /*** MINIPOOL  ******************************************/


    // Getters

    /// @dev Gets the current status of the minipool
    function getStatus() public view returns(uint8) {
        return status.current;
    }

    // @dev Get the last time the status changed
    function getStatusChangedTime() public view returns(uint256) {
        return status.time;
    }

    // @dev Get the last block no where the status changed
    function getStatusChangedBlock() public view returns(uint256) {
        return status.block;
    }

    /// @dev Returns the current staking duration ID
    function getStakingDurationID() public view returns (string memory) {
        return staking.id;
    }

    /// @dev Returns the current staking duration in blocks
    function getStakingDuration() public view returns(uint256) {
        return staking.duration;
    }

    /// @dev Returns the minipool's validator pubkey to be submitted to casper
    function getValidatorPubkey() public view returns (bytes memory) {
        return staking.validatorPubkey;
    }

    /// @dev Returns the minipool's validator signature to be submitted to casper
    function getValidatorSignature() public view returns (bytes memory) {
        return staking.validatorSignature;
    }

    /// @dev Gets the total user deposit capacity
    function getUserDepositCapacity() public view returns(uint256) {
        return userDepositCapacity;
    }

    /// @dev Gets the total value of all assigned user deposits
    function getUserDepositTotal() public view returns(uint256) {
        return userDepositTotal;
    }

    /// @dev Gets the total RPB tokens withdrawn during staking
    function getStakingUserDepositsWithdrawn() public view returns(uint256) {
        return stakingUserDepositsWithdrawn;
    }


    // Methods

    /// @dev Sets the status of the pool based on its current parameters 
    function updateStatus() public returns(bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("updateStatus()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Sets the minipool to logged out
    function logoutMinipool() public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("logoutMinipool()"));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }

    /// @dev Sets the minipool to withdrawn and sets its balance at withdrawal
    /// @param _withdrawalBalance The minipool's balance at withdrawal
    function withdrawMinipool(uint256 _withdrawalBalance) public onlyLatestContract("rocketNodeWatchtower") returns (bool) {
        // Will update the status of the pool if conditions are correct
        (bool success,) = getContractAddress("rocketMinipoolDelegateStatus").delegatecall(abi.encodeWithSignature("withdrawMinipool(uint256)", _withdrawalBalance));
        require(success, "Delegate call failed.");
        // Success
        return true;
    }


}
