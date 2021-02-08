pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/RocketVaultInterface.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolActionsInterface.sol";


import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


// The Rocket Pool Network DAO Actions - This is a placeholder for the network DAO to come
contract RocketDAOProtocolActions is RocketBase, RocketDAOProtocolActionsInterface { 

    using SafeMath for uint;

    // Calculate using this as the base
    uint256 calcBase = 1 ether;

    // The namespace for any data stored in the network DAO (do not change)
    string daoNameSpace = 'dao.protocol';


    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }


    /*** Action Methods ************************/

   
}
