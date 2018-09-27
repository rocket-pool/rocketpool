pragma solidity 0.4.24;

import "./RocketBase.sol";
import "./interface/minipool/RocketMinipoolInterface.sol";
import "./interface/minipool/RocketMinipoolFactoryInterface.sol";
import "./interface/settings/RocketMinipoolSettingsInterface.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";



/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is main pool management contract
/// @author David Rugendyke
contract RocketPool is RocketBase {

    /*** Contracts **************/

    RocketMinipoolInterface rocketMinipool = RocketMinipoolInterface(0);                                    // Interface for common minipool methods
    RocketMinipoolFactoryInterface rocketMinipoolFactory = RocketMinipoolFactoryInterface(0);               // Where minipools are made
    RocketMinipoolSettingsInterface rocketMinipoolSettings = RocketMinipoolSettingsInterface(0);            // Settings for the minipools
    AddressSetStorageInterface addressSetStorage = AddressSetStorageInterface(0);                           // Address list utility

  
    /*** Events ****************/

    event PoolCreated (
        address indexed _address,
        string  indexed _durationID,
        uint256 created
    );

    event PoolRemoved (
        address indexed _address,
        uint256 created
    );


    // TODO: Remove Flag Events
    event FlagAddress (
        address flag
    );

    event FlagUint (
        uint256 flag
    );


       
    /*** Modifiers *************/

    /// @dev Only registered minipool addresses can access
    /// @param _minipoolAddress pool account address.
    modifier onlyMiniPool(address _minipoolAddress) {
        require(rocketStorage.getBool(keccak256(abi.encodePacked("minipool.exists", _minipoolAddress))));
        _;
    }
    
       
    /*** Constructor *************/

    /// @dev rocketPool constructor
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Version
        version = 1;
    }


    /*** Getters *************/

    /// @dev Check if this minipool exists in the network
    /// @param _miniPoolAddress The address of the minipool to check exists
    function getPoolExists(address _miniPoolAddress) view public returns(bool) {
        return rocketStorage.getBool(keccak256(abi.encodePacked("minipool.exists", _miniPoolAddress)));
    }

    /// @dev Returns a count of the current minipools
    /// @param _miniPoolList They key of a minipool list to return the count of eg minipools.list.node or minipools.list.duration
    function getPoolsCount(string _miniPoolList) public returns(uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools", _miniPoolList)));
    }
    

    /*** Methods *************/


    /// @dev Create a minipool
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external onlyLatestContract("rocketNodeAPI", msg.sender) returns (address) {
        // Get contracts
        rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Create minipool contract
        uint256 stakingDuration = rocketMinipoolSettings.getMinipoolStakingDuration(_durationID);
        address minipoolAddress = rocketMinipoolFactory.createRocketMinipool(_nodeOwner, _durationID, _etherAmount, _rplAmount, _isTrustedNode);
        // Ok now set our data to key/value pair storage
        rocketStorage.setBool(keccak256(abi.encodePacked("minipool.exists", minipoolAddress)), true);
        // Update minipool indexes 
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list")), minipoolAddress); 
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.node", _nodeOwner)), minipoolAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.duration", stakingDuration)), minipoolAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.status", uint8(0))), minipoolAddress);
        // Fire the event
        emit PoolCreated(minipoolAddress, _durationID, now);
        // Return minipool address
        return minipoolAddress;
    }

    
    /// @dev Remove a minipool from storage - can only be called by minipools
    /// @param _from The address that requested the minipool removal on the minipool contract
    function minipoolRemove(address _from) external onlyMiniPool(msg.sender) returns (bool) {
        // Can we destroy it?
        if(minipoolRemoveCheck(_from, msg.sender)) {
            // Get contracts
            rocketMinipool = RocketMinipoolInterface(msg.sender);
            addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
            // Remove the existance flag
            rocketStorage.deleteBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)));
            // Update minipool indexes
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list")), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.node", rocketMinipool.getNodeOwner())), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.duration", rocketMinipool.getStakingDuration())), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.status", rocketMinipool.getStatus())), msg.sender); 
             // Fire the event
            emit PoolRemoved(msg.sender, now);
            // Return minipool address
            return true;
        }
        // Safety
        return false;
    }


    /// @dev Can we destroy this minipool? 
    /// @param _sender The user requesting this check
    /// @param _minipool The minipool to check
    function minipoolRemoveCheck(address _sender, address _minipool) public returns (bool) {
        // Get contracts
        rocketMinipool = RocketMinipoolInterface(_minipool);
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Get some common attributes
        uint8 status = rocketMinipool.getStatus();
        // A priority initial check - If a minipool is widowed or stuck for a long time, it is classed as timed out (it has users, not enough to begin staking, but the node owner cannot close it), it can be closed by anyone so users get their funds back
        if(status == 1 && rocketMinipool.getStatusChanged() <= (now + rocketMinipoolSettings.getMinipoolTimeout())) {
            return true;
        }
        // Do some common global checks
        require(rocketMinipoolSettings.getMinipoolClosingEnabled(), "Minipools are not currently allowed to be closed.");
        // If there are users in this minipool, it cannot be closed, only empty ones can
        require(rocketMinipool.getUserCount() == 0, "Cannot close minipool as it has users in it.");
        // Firstly we need to check if this is the node owner that created the minipool
        if(_sender == rocketMinipool.getNodeOwner()) {
            // Owner can only close if its in its initial status - this probably shouldn't ever happen if its passed the first few initial checks, but check again
            require(status == 0, "Minipool has an advanced status, cannot close.");
        }else{
            // Perform non-owner checks
            // TODO: This will be built on more as we add user functionality to the new minipools, just checks for node owners if they can destroy atm
        }
        // If it passes all these checks and doesn't revert, it can close
        return true;
    }


    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /*************************************************************/

    /// @dev Returns an memory array of addresses that do not equal 0, can be overloaded to support other types 
    /// @dev This is handy as memory arrays have a fixed size when initialised, this reduces the array to only valid values (so that .length works as you'd like)
    /// @dev This can be made redundant when .push is supported on dynamic memory arrays
    /// @param _addressArray An array of a fixed size of addresses
    function utilArrayFilterValuesOnly(address[] memory _addressArray) private pure returns (address[] memory) {
        // The indexes for the arrays
        uint[] memory indexes = new uint[](2); 
        indexes[0] = 0;
        indexes[1] = 0;
        // Calculate the length of the non empty values
        for (uint32 i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                indexes[0]++;
            }
        }
        // Create a new memory array at the length of our valid values we counted
        address[] memory valueArray = new address[](indexes[0]);
        // Now populate the array
        for (i = 0; i < _addressArray.length; i++) {
            if (_addressArray[i] != 0) {
                valueArray[indexes[1]] = _addressArray[i];
                indexes[1]++;
            }
        }
        // Now return our memory array with only non empty values at the correct length
        return valueArray;
    }
}