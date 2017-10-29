pragma solidity ^0.4.17;

import "./contract/Owned.sol";


/// @title The gateway hub contract for RocketPool, controls the addresses of the main contracts used and primary persistent storage, should only ever be deployed once
/// @author David Rugendyke

contract RocketHub is Owned {

    /**** Properties ***********/

    mapping (bytes32 => address) public addressBook;    // Our contract address book               


    /**** Nodes ***************/

    // Our rocket nodes, should persist between any Rocket Pool contract upgrades
    mapping (address => Node) private nodes;
    // Keep an array of all our node addresses for iteration
    address[] private nodeAddresses;


    /**** Pools ***************/

    // Our rocket mini pools, should persist between any Rocket Pool contract upgrades
    mapping (address => MiniPool) private pools;
    // Keep an array of all our pool addresses for iteration
    address[] private miniPoolAddresses;


    /**** Partners ***************/

    // Registered 3rd parties that have access to the Rocket Pool API to offer staking services for their users using our automated scaling staking infastructure (wallet providers etc)
    mapping (address => Partner) private partners;
    // Keep an array of all our partner addresses for iteration
    address[] private partnerAddresses;


    /*** Structs ***************/

    struct Node {
        address nodeAccountAddress;
        bytes32 oracleID; // The ID to use for Rocket Pool oracle services such as automatic node creation and automatic node rebooting
        bytes32 instanceID; // The ID of the server instance the node is running on
        bytes32 region; // Region of the node, various regions will be used for each node to increase redundancy and decentralisation
        uint256 averageLoad; // Nodes report in periodically with their current average load (determined by system load / cpu cores), new pools are assigned to nodes with the least current work load to increase redundancy, resiliance and spread the work out
        uint256 lastCheckin; // Nodes should checkin every 15 mins, failure to checkin for a certain time frame (DDOS, server failure etc) means they will have no new pools assigned to them
        uint256 lastRebootAttempt; // Nodes can attempt to reboot other nodes that have become unresponsive. Will work even if the node attempting the reboot is hosted on another provider. This is currently under development.
        bool active; // If the node doesn't checkin for a certain amount of time, it will be set as inactive to avoid assigning any new pools to it incase it is down for any reason
        bool exists;
        // Below has been moved to the node checkin process, may add back here depending on if a variable length type such as 'bytes' can in the future be sent to the Casper contract (not possible with Contract -> Contract yet)
        // bytes validationCode; // Node ID essentially - EVM bytecode, serving as a sort of public key that will be used to verify blocks and other consensus messages signed by this node
        // bytes32 randao; // Node value provided for the casper deposit function should be the result of computing a long chain of hashes (TODO: this will need work in the future when its defined better)
    }

    struct MiniPool {
        address poolContractAddress;
        bool exists;
    }

    struct Partner {
        address partnerAddress;
        bytes32 name;
        bool exists;
    }


    /*** Events ****************/

    event AddressBookEntryAdded (
        bytes32 indexed _id,
        address indexed _address,
        uint256 created 
    );


    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the main RocketPool contract
    modifier onlyLatestRocketPool() {
        assert(msg.sender == addressBook[keccak256("rocketPool")]);
        _;
    }

    /// @dev Only allow access from the latest version of the RocketNode contract
    modifier onlyLatestRocketNode() {
        assert(msg.sender == addressBook[keccak256("rocketNode")]);
        _;
    }  

    /// @dev Only allow access from the latest version of the main RocketPartnerAPI contract
    modifier onlyLatestRocketPartnerAPI() {
        assert(msg.sender == addressBook[keccak256("rocketPartnerAPI")]);
        _;
    } 

    /// @dev Only registered pool node addresses can access
    /// @param nodeAccountAddress node account address.
    modifier onlyRegisteredNode(address nodeAccountAddress) {
        assert(getRocketNodeExists(nodeAccountAddress) == true);
        _;
    }

    /// @dev Only a registered mini pool
    /// @param miniPoolAddress mini pool contract address.
    modifier onlyRegisteredPool(address miniPoolAddress) { 
        assert(getRocketMiniPoolExists(miniPoolAddress) == true);
        _;
    }

    /// @dev Only registered partner addresses can access
    /// @param partnerAddress node account address.
    modifier onlyRegisteredPartner(address partnerAddress) {
        assert(getRocketPartnerExists(partnerAddress) == true);
        _;
    }


    /**** Methods ***********/

    /// @dev RocketHub constructor
    function RocketHub() public {}


    /**** Contract Addresses ***************/

    /// @dev Set the address of a new contract in our address book
    /// @param addressId The bytes32 ID of the contract
    /// @param newContractAddress The address of the new main rocket pool contract
    function setAddress(bytes32 addressId, address newContractAddress) public onlyOwner {
        // Check its a valid address
        assert(newContractAddress != 0x0);
        // Add the address now
        addressBook[addressId] = newContractAddress;
        // Fire the event
        AddressBookEntryAdded(addressId, newContractAddress, now);
    }

    /// @dev Get the address of a contract from our address book
    /// @param addressId The bytes32 ID of the contract
    function getAddress(bytes32 addressId) public view returns(address) {
        // Return the address now
        return addressBook[addressId];
    }

    

    /**** Node Storage ***************/

    /// @dev Sets a new registered Rocket Node to storage, the logic for adding is contained in the main Rocket Pool contract, so access to storage is only permitted through the latest version of that contract
    /// @param nodeAccountAddressToRegister The node address to add.
    function setRocketNode(address nodeAccountAddressToRegister, bytes32 newOracleID, bytes32 newInstanceID) public onlyLatestRocketNode returns(bool) {
        // Basic error checking for the storage
        if (nodeAccountAddressToRegister != 0 && nodes[nodeAccountAddressToRegister].exists == false) {
            // Add the new node to the mapping of Node structs
            nodes[nodeAccountAddressToRegister] = Node({
                nodeAccountAddress: nodeAccountAddressToRegister,
                oracleID: newOracleID,
                instanceID: newInstanceID,
                region: "tba",
                averageLoad: 0,
                lastCheckin: now,
                lastRebootAttempt: 0,
                active: true,
                exists: true
                //validationCode:    , // Supplied by node upon pool deployment now due to being variable length byte code
                // randao: 0,         // Supplied by node upon pool deployment now
            });
            // Store our node address so we can iterate over it if needed
            nodeAddresses.push(nodeAccountAddressToRegister);
            // Success
            return true;
        }
        return false;
    }

    /// @dev Update the current average server load on the node, last checkin time etc
    function setRocketNodeCheckin(address nodeAddress, uint256 averageLoad, uint256 lastCheckin) public onlyRegisteredNode(nodeAddress) onlyLatestRocketPool {
        nodes[nodeAddress].averageLoad = averageLoad;
        nodes[nodeAddress].lastCheckin = lastCheckin;
    }

    /// @dev Rocket Pool can manually/automatically deactivate a node if it is down or running badly (high load), this will stop the node accepting new pools to be assigned to it
    function setRocketNodeActive(address nodeAddress, bool activate) public onlyRegisteredNode(nodeAddress) onlyLatestRocketNode {
        nodes[nodeAddress].active = activate;
    }

    /// @dev Removes a node from storage 
    /// @param nodeAddressToRemove The node to remove.
    function setRocketNodeRemove(address nodeAddressToRemove) public onlyRegisteredNode(nodeAddressToRemove) onlyLatestRocketNode returns(bool) {
        // Remove the node now
        uint i = 0;
        bool found = false;
        for (i = 0; i < nodeAddresses.length; i++) {
            if (nodeAddresses[i] == nodeAddressToRemove) {
                found = true;
                for (uint x = i; x < nodeAddresses.length-1; x++) {
                    nodeAddresses[x] = nodeAddresses[x+1];
                }
                delete nodeAddresses[nodeAddresses.length-1];
                nodeAddresses.length--;
            }
        }
        // Did we find them?
        if (found) {
            // Now remove from our mapping struct
            nodes[nodeAddressToRemove].exists = false;
            nodes[nodeAddressToRemove].nodeAccountAddress = 0;
            nodes[nodeAddressToRemove].oracleID = "";
            nodes[nodeAddressToRemove].instanceID = "";
            nodes[nodeAddressToRemove].region = "";
            nodes[nodeAddressToRemove].averageLoad = 0;
            nodes[nodeAddressToRemove].lastCheckin = 0;
            nodes[nodeAddressToRemove].lastRebootAttempt = 0;
            nodes[nodeAddressToRemove].active = false;
            // All good
            return true;
        }
        return false;
    }

    /// @dev Returns a single rocket node struct
    function getRocketNode(address nodeAddress) public constant onlyRegisteredNode(nodeAddress) returns(address, uint256, uint256, bool, bool) {
        return (nodes[nodeAddress].nodeAccountAddress,  
                nodes[nodeAddress].averageLoad, 
                nodes[nodeAddress].lastCheckin,
                nodes[nodeAddress].active, 
                nodes[nodeAddress].exists
        );
    }

    /// @dev Checks to see if the current node address is a legit registered Rocket Node
    /// @param nodeAccountAddress The registered rocket node address.
    function getRocketNodeExists(address nodeAccountAddress) public constant returns(bool) {
         if (nodes[nodeAccountAddress].exists == true) {
             return true;
         }
         return false;
    }

    /// @dev Returns a single rocket node address at the array index
    function getRocketNodeByIndex(uint addressIndex) public constant returns(address) {
        assert(nodes[nodeAddresses[addressIndex]].exists == true);
        return nodeAddresses[addressIndex];
    }

    /// @dev Returns the amount of registered rocket nodes
    function getRocketNodeCount() public constant returns(uint) {
        return nodeAddresses.length; 
    }

    /// @dev Return the average server work load for this node
    function getRocketNodeAverageLoad(address nodeAddress) public constant onlyRegisteredNode(nodeAddress) returns(uint256) {
        return  nodes[nodeAddress].averageLoad;
    }

    /// @dev Return the last time this node checked in with the main Rocket Pool
    function getRocketNodeLastCheckin(address nodeAddress) public constant onlyRegisteredNode(nodeAddress) returns(uint256) {
        return  nodes[nodeAddress].lastCheckin;
    }

    /// @dev Return the active status of this node, if deactivated it will not accept new mini pools
    function getRocketNodeActive(address nodeAddress) public constant onlyRegisteredNode(nodeAddress) returns(bool) {
        return  nodes[nodeAddress].active;
    }


    /**** Mini Pool Storage ***************/

    /// @dev Sets a new mini rocket pool address to storage, the logic for adding is contained in the main Rocket Pool contract, so access to storage is only permitted through the latest version of that contract
    /// @param miniPoolAddressToRegister The new mini pool contract address to add.
    function setRocketMiniPool(address miniPoolAddressToRegister) public onlyLatestRocketPool returns(bool) {
        // Basic error checking for the storage
        if (miniPoolAddressToRegister != 0 && pools[miniPoolAddressToRegister].exists == false) {
            // Add the new mini pool to the mapping of pool structs
            pools[miniPoolAddressToRegister] = MiniPool({
                poolContractAddress: miniPoolAddressToRegister,
                exists: true
            });
            // Add our new pool contract address now to keep track off
            miniPoolAddresses.push(miniPoolAddressToRegister);
            // Success
            return true;
        }
        return false;
    }

    /// @dev Removes a mini pool from storage after it self destructs
    /// @param miniPoolAddressToRemove The mini pool contract address to remove.
    function setRocketMiniPoolRemove(address miniPoolAddressToRemove) public onlyLatestRocketPool onlyRegisteredPool(miniPoolAddressToRemove) returns(bool) {
        // Remove the pool now
        uint i = 0;
        bool found = false;
        for (i = 0; i < miniPoolAddresses.length; i++) {
            if (miniPoolAddresses[i] == miniPoolAddressToRemove) {
                found = true;
                for (uint x = i; x < miniPoolAddresses.length-1; x++) {
                    miniPoolAddresses[x] = miniPoolAddresses[x+1];
                }
                delete miniPoolAddresses[miniPoolAddresses.length-1];
                miniPoolAddresses.length--;
            }
        }
        // Did we find them?
        if (found) {
            // Now remove from our mapping struct
            pools[miniPoolAddressToRemove].exists = false;
            pools[miniPoolAddressToRemove].poolContractAddress = 0;
            // All good
            return true;
        }
        return false;
    }


    /// @dev Returns a single rocket mini pool at the pool address
    function getRocketMiniPool(address miniPoolAddress) public constant onlyRegisteredPool(miniPoolAddress) returns(address, bool) {
        return (pools[miniPoolAddress].poolContractAddress, pools[miniPoolAddress].exists);
    }

    /// @dev Checks to see if the current pool address is a legit registered Rocket Mini Pool
    /// @param miniPoolAddress The registered rocket mini pool address.
    function getRocketMiniPoolExists(address miniPoolAddress) public constant returns(bool) {
         if (pools[miniPoolAddress].exists == true) {
             return true;
         }
         return false;
    }

    /// @dev Returns a single rocket mini pool at the array index
    function getRocketMiniPoolByIndex(uint addressIndex) public constant returns(address) {
        assert(pools[miniPoolAddresses[addressIndex]].exists == true);
        return miniPoolAddresses[addressIndex];
    }

    /// @dev Returns the amount of registered rocket nodes
    function getRocketMiniPoolCount() public constant returns(uint) {
        return miniPoolAddresses.length;
    }
    
    
    /**** Partner Storage ***************/

    /// @dev Sets a new 3rd party partner address, partners can enable staking for their users using our API and infrastructure 
    /// @param partnerAddressToRegister The msg.send address associated with this partner. Partners can have multiple ones registered.
    /// @param parterName The name of the partner
    function setRocketPartner(address partnerAddressToRegister, bytes32 parterName) public onlyLatestRocketPartnerAPI returns(bool) {
        // Basic error checking for the storage
        if (partnerAddressToRegister != 0 && partners[partnerAddressToRegister].exists == false) {
            // Add the new partner to the mapping of Partner structs
            partners[partnerAddressToRegister] = Partner({
                partnerAddress: partnerAddressToRegister,
                name: parterName,
                exists: true
            });
            // Add our new partner address now to keep track off
            partnerAddresses.push(partnerAddressToRegister);
            // Success
            return true;
        }
        return false;
    }

    /// @dev Removes a partner from storage 
    /// @param partnerAddressToRemove The partner to remove.
    function setRocketPartnerRemove(address partnerAddressToRemove) public onlyRegisteredPartner(partnerAddressToRemove) onlyLatestRocketPartnerAPI returns(bool) {
        // Remove the partner now
        uint i = 0;
        bool found = false;
        for (i = 0; i < partnerAddresses.length; i++) {
            if (partnerAddresses[i] == partnerAddressToRemove) {
                found = true;
                for (uint x = i; x < partnerAddresses.length-1; x++) {
                    partnerAddresses[x] = partnerAddresses[x+1];
                }
                delete partnerAddresses[partnerAddresses.length-1];
                partnerAddresses.length--;
            }
        }
        // Did we find them?
        if (found) {
            // Now remove from our mapping struct
            partners[partnerAddressToRemove].exists = false;
            partners[partnerAddressToRemove].partnerAddress = 0;
            partners[partnerAddressToRemove].name = "";
            // All good
            return true;
        }
        return false;
    }

    /// @dev Checks to see if the current partner address is a legit registered Rocket partner
    /// @param partnerAddress The registered rocket partner address.
    function getRocketPartnerExists(address partnerAddress) public constant returns(bool) {
        if (partners[partnerAddress].exists == true) {
            return true;
        }
        return false;
    }

    /// @dev Returns the amount of registered rocket partners
    function getRocketPartnerCount() public constant returns(uint) {
        return partnerAddresses.length;
    }


}
