pragma solidity 0.4.19;


import "./RocketBase.sol";


/// @title Ether/Tokens held in the RocketVault are stored here
/// @author Jake Pospischil

contract RocketVaultStore is RocketBase {


    /**** Libs *****************/
    
    using SafeMath for uint;


    /*** Contracts *************/


    /*** Modifiers *************/

    /// @dev Only allow access from the latest version of the RocketVault contract
    modifier onlyLatestRocketVault() {
        require(msg.sender == rocketStorage.getAddress(keccak256("contract.name", "rocketVault")));
        _;
    }


    /*** Constructor ***********/

    /// @dev RocketVaultStore constructor
    function RocketVaultStore(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) public {
        // Set the version
        version = 1;
    }


    /**** Methods **************/




}
