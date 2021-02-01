pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/network/RocketDAONetworkInterface.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";


// The Rocket Pool Network DAO - This is a placeholder for the network DAO to come
contract RocketDAONetwork is RocketBase, RocketDAONetworkInterface {

    using SafeMath for uint;

    // The namespace for any data stored in the network DAO (do not change)
    string daoNameSpace = 'dao.network';

    // Only allow bootstrapping the dao if it has less than the required members to form the DAO
    modifier onlyBootstrapMode() {
        require(getBootstrapModeDisabled() == false, "Bootstrap mode not engaged");
        _;
    }
    
    // Construct
    constructor(address _rocketStorageAddress) RocketBase(_rocketStorageAddress) {
        // Version
        version = 1;
    }


    /**** DAO Properties **************/

    // Returns true if bootstrap mode is disabled
    function getBootstrapModeDisabled() override public view returns (bool) { 
        return getBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled"))); 
    }




    /**** Bootstrapping ***************/
    // While bootstrap mode is engaged, RP can change settings alongside the DAO (when its implemented). When disabled, only DAO will be able to control settings

    // Bootstrap mode - Setting
    function bootstrapSettingUint(string memory _settingNameSpace, string memory _settingPath, uint256 _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONetwork", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress('rocketDAONetworkProposals').call(abi.encodeWithSignature("proposalSettingUint(string,string,uint256)", _settingNameSpace, _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set a claiming contract to receive a % of RPL inflation rewards
    function bootstrapSettingClaimer(string memory _contractName, uint256 _perc) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAONetwork", address(this)) {
        // Ok good to go, lets update the rewards claiming contract amount 
        (bool success, bytes memory response) = getContractAddress('rocketDAONetworkProposals').call(abi.encodeWithSignature("proposalSettingRewardsClaimer(string,uint256)", _contractName, _perc));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override public onlyGuardian onlyLatestContract("rocketDAONetwork", address(this)) {
        require(_confirmDisableBootstrapMode == true, 'You must confirm disabling bootstrap mode, it can only be done once!');
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true); 
    }

}
