pragma solidity 0.4.24;

// Contracts
import "./RocketBase.sol";
// Interfaces
import "./interface/RocketNodeInterface.sol";
import "./interface/minipool/RocketMinipoolInterface.sol";
import "./interface/minipool/RocketMinipoolFactoryInterface.sol";
import "./interface/settings/RocketMinipoolSettingsInterface.sol";
import "./interface/utils/lists/AddressSetStorageInterface.sol";
// Libraries
import "./lib/SafeMath.sol";



/// @title First alpha of an Ethereum POS pool - Rocket Pool! - This is main pool management contract
/// @author David Rugendyke
contract RocketPool is RocketBase {

    /*** Libs  ******************/

    using SafeMath for uint;

    /*** Contracts **************/

    RocketNodeInterface rocketNode = RocketNodeInterface(0);                                                // Interface for node methods
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
    modifier onlyMinipool(address _minipoolAddress) {
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
    function getPoolsCount() public returns(uint256) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getCount(keccak256(abi.encodePacked("minipools", "list")));
    }


    /// @dev Return a current minipool by index
    function getPoolAt(uint256 _index) public returns (address) {
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools", "list")), _index);
    }


    /// @dev Get the address of a pseudorandom available node's first minipool
    function getRandomAvailableMinipool(string _durationID, uint256 _nonce) public returns (address) {
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        (address nodeAddress, bool nodeTrusted) = rocketNode.getRandomAvailableNode(_durationID, _nonce);
        return addressSetStorage.getItem(keccak256(abi.encodePacked("minipools", "list.node.available", nodeAddress, nodeTrusted, _durationID)), 0);
    }


    /// @dev Get the total ether value of the network by key
    /// @param _type The type of total ether value to retrieve (e.g. "capacity")
    /// @param _durationID The staking duration
    function getTotalEther(string _type, string _durationID) public view returns (uint256) {
        return rocketStorage.getUint(keccak256(abi.encodePacked("network.ether.total", _type, _durationID)));
    }


    /// @dev Get the current network utilisation (assigned ether / ether capacity) as a fraction of 1 ether
    /// @param _durationID The staking duration
    function getNetworkUtilisation(string _durationID) public view returns (uint256) {
        uint256 etherCapacity = getTotalEther("capacity", _durationID);
        if (etherCapacity == 0) { return 1 ether; }
        uint256 base = 1 ether;
        return base.mul(getTotalEther("assigned", _durationID)).div(etherCapacity);
    }



    /*** Setters *************/

    /// @dev Set a minipool's available status - only externally available to minipools
    /// @param _available The availability of the minipool
    function setMinipoolAvailable(bool _available) external onlyMinipool(msg.sender) {
        minipoolAvailable(msg.sender, _available);
    }

    /// @param _type The type of total ether value to increase (e.g. "capacity") - only externally available to minipools
    /// @param _value The amount to increase the total ether value by
    /// @param _durationID The staking duration
    function setNetworkIncreaseTotalEther(string _type, string _durationID, uint256 _value) external onlyMinipool(msg.sender) {
        networkIncreaseTotalEther(_type, _durationID, _value);
    }

    /// @dev Decrease the total ether value of the network by key
    /// @param _type The type of total ether value to decrease (e.g. "capacity")
    /// @param _value The amount to decrease the total ether value by
    /// @param _durationID The staking duration
    function setNetworkDecreaseTotalEther(string _type, string _durationID, uint256 _value) external onlyMinipool(msg.sender) {
        networkDecreaseTotalEther(_type, _durationID, _value);
    }


   
    /*** Methods - Minipool *************/


    /// @dev Create a minipool
    function minipoolCreate(address _nodeOwner, string _durationID, uint256 _etherAmount, uint256 _rplAmount, bool _isTrustedNode) external onlyLatestContract("rocketNodeAPI", msg.sender) returns (address) {
        // Get contracts
        rocketMinipoolFactory = RocketMinipoolFactoryInterface(getContractAddress("rocketMinipoolFactory"));
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        // Create minipool contract
        address minipoolAddress = rocketMinipoolFactory.createRocketMinipool(_nodeOwner, _durationID, _etherAmount, _rplAmount, _isTrustedNode);
        // Ok now set our data to key/value pair storage
        rocketStorage.setBool(keccak256(abi.encodePacked("minipool.exists", minipoolAddress)), true);
        // Update minipool indexes 
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list")), minipoolAddress); 
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.node", _nodeOwner)), minipoolAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.duration", _durationID)), minipoolAddress);
        addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.status", uint8(0))), minipoolAddress);
        // Set minipool available
        minipoolAvailable(minipoolAddress, true);
        // Increase total network ether capacity
        networkIncreaseTotalEther("capacity", _durationID, rocketMinipoolSettings.getMinipoolLaunchAmount() - _etherAmount);
        // Fire the event
        emit PoolCreated(minipoolAddress, _durationID, now);
        // Return minipool address
        return minipoolAddress;
    }

    
    /// @dev Remove a minipool from storage - can only be called by minipools
    function minipoolRemove() external onlyMinipool(msg.sender) returns (bool) {
        // Can we destroy it?
        if(minipoolRemoveCheck(msg.sender)) {
            // Get contracts
            rocketMinipool = RocketMinipoolInterface(msg.sender);
            rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
            addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
            // Remove the existance flag
            rocketStorage.deleteBool(keccak256(abi.encodePacked("minipool.exists", msg.sender)));
            // Update minipool indexes
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list")), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.node", rocketMinipool.getNodeOwner())), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.duration", rocketMinipool.getStakingDurationID())), msg.sender);
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.status", rocketMinipool.getStatus())), msg.sender);
            // Set minipool unavailable
            minipoolAvailable(msg.sender, false);
            // Decrease total network ether capacity
            networkDecreaseTotalEther("capacity", rocketMinipool.getStakingDurationID(), rocketMinipoolSettings.getMinipoolLaunchAmount() - rocketMinipool.getNodeDepositEther());
            // Fire the event
            emit PoolRemoved(msg.sender, now);
            // Return minipool address
            return true;
        }
        // Safety
        return false;
    }


    /// @dev Can we destroy this minipool? 
    /// @param _minipool The minipool to check
    function minipoolRemoveCheck(address _minipool) public returns (bool) {
        // Get contracts
        rocketMinipool = RocketMinipoolInterface(_minipool);
        rocketMinipoolSettings = RocketMinipoolSettingsInterface(getContractAddress("rocketMinipoolSettings"));
        // Are minipools allowed to be closed?
        if (rocketMinipoolSettings.getMinipoolClosingEnabled() == false) { return false; }
        // If there are users in this minipool, it cannot be closed, only empty ones can
        if (rocketMinipool.getUserCount() > 0) { return false; }
        // If the node operator's deposit still exists in this minipool, it cannot be closed
        if (rocketMinipool.getNodeDepositExists() == true) { return false; }
        // If it passes all these checks, it can close
        return true;
    }


    /// @dev Set a minipool's available status
    /// @param _minipool The minipool address
    /// @param _available Boolean that indicates the availability of the minipool
    function minipoolAvailable(address _minipool, bool _available) private returns (bool) {
        // Get contracts
        rocketNode = RocketNodeInterface(getContractAddress("rocketNode"));
        addressSetStorage = AddressSetStorageInterface(getContractAddress("utilAddressSetStorage"));
        rocketMinipool = RocketMinipoolInterface(_minipool);
        // Get minipool properties
        address nodeOwner = rocketMinipool.getNodeOwner();
        bool trusted = rocketMinipool.getNodeTrusted();
        string memory durationID = rocketMinipool.getStakingDurationID();
        // Set available
        if (_available) {
            // Add minipool to node's available set
            addressSetStorage.addItem(keccak256(abi.encodePacked("minipools", "list.node.available", nodeOwner, trusted, durationID)), _minipool);
            // Add node to available set
            rocketNode.setNodeAvailable(nodeOwner, trusted, durationID);
        }
        // Set unavailable
        else {
            // Remove minipool from node's available set
            addressSetStorage.removeItem(keccak256(abi.encodePacked("minipools", "list.node.available", nodeOwner, trusted, durationID)), _minipool);
            // Remove node from available set if out of minipools
            if (addressSetStorage.getCount(keccak256(abi.encodePacked("minipools", "list.node.available", nodeOwner, trusted, durationID))) == 0) {
                rocketNode.setNodeUnavailable(nodeOwner, trusted, durationID);
            }
        }
        // Success
        return true;
    }


    /*** Methods - Network *************/


    /// @dev Increase the total ether value of the network by key
    /// @param _type The type of total ether value to increase (e.g. "capacity")
    /// @param _value The amount to increase the total ether value by
    /// @param _durationID The staking duration
    function networkIncreaseTotalEther(string _type, string _durationID, uint256 _value) private {
        rocketStorage.setUint(keccak256(abi.encodePacked("network.ether.total", _type, _durationID)),
            rocketStorage.getUint(keccak256(abi.encodePacked("network.ether.total", _type, _durationID))).add(_value)
        );
    }


    // TODO: decrease total network ether "capacity" & "assigned" when minipool withdraws from Casper
    /// @dev Decrease the total ether value of the network by key
    /// @param _type The type of total ether value to decrease (e.g. "capacity")
    /// @param _value The amount to decrease the total ether value by
    /// @param _durationID The staking duration
    function networkDecreaseTotalEther(string _type, string _durationID, uint256 _value) private {
        rocketStorage.setUint(keccak256(abi.encodePacked("network.ether.total", _type, _durationID)),
            rocketStorage.getUint(keccak256(abi.encodePacked("network.ether.total", _type, _durationID))).sub(_value)
        );
    }



    /*** UTILITIES ***********************************************/
    /*** Note: Methods here require passing dynamic memory types
    /*** which can't currently be sent to a library contract (I'd prefer to keep these in a lib if possible, but its not atm)
    /************************************************************
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
    */

}