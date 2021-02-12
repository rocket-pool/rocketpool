pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../../RocketBase.sol";
import "../../../interface/dao/protocol/RocketDAOProtocolInterface.sol";


// The Rocket Pool Network DAO - This is a placeholder for the network DAO to come
contract RocketDAOProtocol is RocketBase, RocketDAOProtocolInterface {

    // The namespace for any data stored in the network DAO (do not change)
    string private daoNameSpace = 'dao.protocol';

    // Only allow bootstrapping when enabled
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

    // Bootstrap mode - Uint Setting
    function bootstrapSettingUint(string memory _settingContractName, string memory _settingPath, uint256 _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress('rocketDAOProtocolProposals').call(abi.encodeWithSignature("proposalSettingUint(string,string,uint256)", _settingContractName, _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Bool Setting
    function bootstrapSettingBool(string memory _settingContractName, string memory _settingPath, bool _value) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the settings 
        (bool success, bytes memory response) = getContractAddress('rocketDAOProtocolProposals').call(abi.encodeWithSignature("proposalSettingBool(string,string,bool)", _settingContractName, _settingPath, _value));
        // Was there an error?
        require(success, getRevertMsg(response));
    }

    // Bootstrap mode - Set a claiming contract to receive a % of RPL inflation rewards
    function bootstrapSettingClaimer(string memory _contractName, uint256 _perc) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the rewards claiming contract amount 
        (bool success, bytes memory response) = getContractAddress('rocketDAOProtocolProposals').call(abi.encodeWithSignature("proposalSettingRewardsClaimer(string,uint256)", _contractName, _perc));
        // Was there an error?
        require(success, getRevertMsg(response));
    } 

    // Bootstrap mode -Spend DAO treasury
    function bootstrapSpendTreasury(string memory _invoiceID, address _recipientAddress, uint256 _amount) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        // Ok good to go, lets update the rewards claiming contract amount 
        (bool success, bytes memory response) = getContractAddress('rocketDAOProtocolProposals').call(abi.encodeWithSignature("proposalSpendTreasury(string,address,uint256)", _invoiceID, _recipientAddress, _amount));
        // Was there an error?
        require(success, getRevertMsg(response));
    }


    // Bootstrap mode - Disable RP Access (only RP can call this to hand over full control to the DAO)
    function bootstrapDisable(bool _confirmDisableBootstrapMode) override public onlyGuardian onlyBootstrapMode onlyLatestContract("rocketDAOProtocol", address(this)) {
        require(_confirmDisableBootstrapMode == true, 'You must confirm disabling bootstrap mode, it can only be done once!');
        setBool(keccak256(abi.encodePacked(daoNameSpace, "bootstrapmode.disabled")), true); 
    }

}
