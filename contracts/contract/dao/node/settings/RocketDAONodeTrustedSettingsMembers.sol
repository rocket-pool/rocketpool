pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "./RocketDAONodeTrustedSettings.sol";
import "../../../../interface/dao/node/settings/RocketDAONodeTrustedSettingsMembersInterface.sol";


// The Trusted Node DAO Members 
contract RocketDAONodeTrustedSettingsMembers is RocketDAONodeTrustedSettings, RocketDAONodeTrustedSettingsMembersInterface { 

    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress) RocketDAONodeTrustedSettings(_rocketStorageAddress, "members") {
        // Set version
        version = 1;
        // Initialize settings on deployment
        if(!getBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")))) {
            // Init settings
            setSettingUint("members.quorum", 0.51 ether);                    // Member quorum threshold that must be met for proposals to pass (51%)
            setSettingUint("members.rplbond", 1750 ether);                   // Bond amount required for a new member to join (in RPL)
            setSettingUint("members.minipool.unbonded.max", 30);             // The amount of unbonded minipool validators members can make (these validators are only used if no regular bonded validators are available)
            setSettingUint("members.minipool.unbonded.min.fee", 0.8 ether);  // Node fee must be over this percentage of the maximum fee before validator members are allowed to make unbonded pools (80%)
            setSettingUint("members.challenge.cooldown", 7 days);            // How long a member must wait before performing another challenge in seconds
            setSettingUint("members.challenge.window", 7 days);              // How long a member has to respond to a challenge in seconds
            setSettingUint("members.challenge.cost", 1 ether);               // How much it costs a non-member to challenge a members node. It's free for current members to challenge other members.
            // Settings initialised
            setBool(keccak256(abi.encodePacked(settingNameSpace, "deployed")), true);
        }
    }


    /*** Set Uint *****************************************/

    // Update a setting, overrides inherited setting method with extra checks for this contract
    function setSettingUint(string memory _settingPath, uint256 _value) override public onlyDAONodeTrustedProposal {
        // Some safety guards for certain settings
        if(keccak256(abi.encodePacked(_settingPath)) == keccak256(abi.encodePacked("members.quorum"))) require(_value > 0 ether && _value <= 0.9 ether, "Quorum setting must be > 0 & <= 90%");
        // Update setting now
        setUint(keccak256(abi.encodePacked(settingNameSpace, _settingPath)), _value);
    } 
  
    // Getters

    // The member proposal quorum threshold for this DAO
    function getQuorum() override external view returns (uint256) {
        return getSettingUint("members.quorum");
    }

    // Amount of RPL needed for a new member
    function getRPLBond() override external view returns (uint256) {
        return getSettingUint("members.rplbond");
    }

    // The amount of unbonded minipool validators members can make (these validators are only used if no regular bonded validators are available)
    function getMinipoolUnbondedMax() override external view returns (uint256) {
        return getSettingUint("members.minipool.unbonded.max");
    }

    // Node fee must be over this percentage of the maximum fee before validator members are allowed to make unbonded pools
    function getMinipoolUnbondedMinFee() override external view returns (uint256) {
        return getSettingUint('members.minipool.unbonded.min.fee');
    }

    // How long a member must wait before making consecutive challenges in seconds
    function getChallengeCooldown() override external view returns (uint256) {
        return getSettingUint("members.challenge.cooldown");
    }

    // The window available to meet any node challenges in seconds
    function getChallengeWindow() override external view returns (uint256) {
        return getSettingUint("members.challenge.window");
    }

    // How much it costs a non-member to challenge a members node. It's free for current members to challenge other members.
    function getChallengeCost() override external view returns (uint256) {
        return getSettingUint("members.challenge.cost");
    }
}
