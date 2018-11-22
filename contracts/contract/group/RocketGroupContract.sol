pragma solidity 0.5.0;

// Interfaces
import "./../../interface/RocketStorageInterface.sol";
import "./../../interface/settings/RocketGroupSettingsInterface.sol";


/// @title The contract for a group that operates in Rocket Pool, holds the entities fees and more
/// @author David Rugendyke

contract RocketGroupContract {

    /**** Properties ***********/

    address public owner;                                                       // The group owner that created the contract
    uint8   public version;                                                     // Version of this contract
    uint256 private feePerc = 0;                                                // The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)

    mapping(address => bool) private depositors;                                // Valid depositor contracts for the group
    uint256 private depositorCount = 0;
    mapping(address => bool) private withdrawers;                               // Valid withdrawer contracts for the group
    uint256 private withdrawerCount = 0;


    /*** Contracts ***************/

    RocketStorageInterface rocketStorage = RocketStorageInterface(0);           // The main Rocket Pool storage contract where primary persistant storage is maintained
    RocketGroupSettingsInterface rocketGroupSettings = RocketGroupSettingsInterface(0);

    /*** Events ******************/


    event DepositorAdd (
        address indexed _depositor,
        uint256 added
    );

    event DepositorRemove (
        address indexed _depositor,
        uint256 removed
    );

    event WithdrawerAdd (
        address indexed _withdrawer,
        uint256 added
    );

    event WithdrawerRemove (
        address indexed _withdrawer,
        uint256 removed
    );


    /*** Modifiers ***************/

    /**
    * @dev Throws if called by any account other than the owner.
    */
    modifier onlyGroupOwner() {
      require(msg.sender == owner, "Only the group owner account can perform this function.");
      _;
    }

    /**
    * @dev Throws if fee percentage is invalid.
    */
    modifier onlyValidFeePerc(uint256 _stakingFeePerc) {
        // Check its a legit amount
        require(_stakingFeePerc <= 1 ether, "User fee cannot be greater than 100%.");
        _;
    }

     
    /*** Constructor *************/

    /// @dev RocketGroupContract constructor
    constructor(address _rocketStorageAddress, address _owner, uint256 _stakingFeePerc) public onlyValidFeePerc(_stakingFeePerc) {
        // Version
        version = 1;
        // Update the storage contract address
        rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        // Set the group owner
        owner = _owner;
        // Set the staking fee percent
        feePerc = _stakingFeePerc;
    }

    /*** Getters *************/

    /// @dev The fee this groups charges their users given as a % of 1 Ether (eg 0.02 ether = 2%)
    function getFeePerc() public view returns(uint256) { 
        // Get the fee for this groups users
        return feePerc;
    }

    /// @dev Get the fee that Rocket Pool charges for this group given as a % of 1 Ether (eg 0.02 ether = 2%)
    function getFeePercRocketPool() public returns(uint256) { 
        // Get the settings
        rocketGroupSettings = RocketGroupSettingsInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketGroupSettings"))));
        // Get the RP fee
        return rocketGroupSettings.getDefaultFee();
    }

    /// @dev Check that a depositor exists in the group
    function hasDepositor(address _depositorAddress) public view returns (bool) {
        return depositors[_depositorAddress];
    }

    /// @dev Check that a withdrawer exists in the group
    function hasWithdrawer(address _withdrawerAddress) public view returns (bool) {
        return withdrawers[_withdrawerAddress];
    }


    /*** Setters *************/

    /// @dev Set the fee this group charges their users - Given as a % of 1 Ether (eg 0.02 ether = 2%)
    function setFeePerc(uint256 _stakingFeePerc) public onlyGroupOwner onlyValidFeePerc(_stakingFeePerc) returns(bool) {
        // Ok set it
        feePerc = _stakingFeePerc;
        // Done
        return true;
    }


    /*** Methods *************/


    /// @dev Add a depositor contract
    function addDepositor(address _depositorAddress) public onlyGroupOwner {
        require(!depositors[_depositorAddress], "Depositor already exists in the group");
        depositors[_depositorAddress] = true;
        ++depositorCount;
        emit DepositorAdd(_depositorAddress, now);
    }


    /// @dev Remove a depositor contract
    function removeDepositor(address _depositorAddress) public onlyGroupOwner {
        require(depositors[_depositorAddress], "Depositor does not exist in the group");
        depositors[_depositorAddress] = false;
        --depositorCount;
        emit DepositorRemove(_depositorAddress, now);
    }


    /// @dev Add a withdrawer contract
    function addWithdrawer(address _withdrawerAddress) public onlyGroupOwner {
        require(!withdrawers[_withdrawerAddress], "Withdrawer already exists in the group");
        withdrawers[_withdrawerAddress] = true;
        ++withdrawerCount;
        emit WithdrawerAdd(_withdrawerAddress, now);
    }


    /// @dev Remove a withdrawer contract
    /// @dev The last withdrawer contract cannot be removed - at least one must always remain
    function removeWithdrawer(address _withdrawerAddress) public onlyGroupOwner {
        require(withdrawers[_withdrawerAddress], "Withdrawer does not exist in the group");
        require(withdrawerCount > 1, "The last withdrawer in the group cannot be removed");
        withdrawers[_withdrawerAddress] = false;
        --withdrawerCount;
        emit WithdrawerRemove(_withdrawerAddress, now);
    }


}
