pragma solidity 0.5.8;


// Interfaces
import "./RocketMinipoolBase.sol";
import "../../interface/minipool/RocketMinipoolInterface.sol";
// Libraries
import "../../lib/SafeMath.sol";


/// @title The minipool delegate for node methods, should contain all primary logic for methods that minipools use, is entirely upgradable so that currently deployed pools can get any bug fixes or additions - storage here MUST match the minipool contract
/// @author David Rugendyke

contract RocketMinipoolDelegateNode is RocketMinipoolBase {

    /*** Libs  *****************/

    using SafeMath for uint;


    /*** Events ****************/


    event NodeDeposit (
        address indexed _from,                                  // Transferred from
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );

    event NodeWithdrawal (
        address indexed _to,                                    // Transferred to
        uint256 etherAmount,                                    // Amount of ETH
        uint256 rethAmount,                                      // Amount of rETH
        uint256 rplAmount,                                      // Amount of RPL
        uint256 created                                         // Creation timestamp
    );


    /*** Methods *************/


    /// @dev minipool constructor
    /// @param _rocketStorageAddress Address of Rocket Pools storage.
    constructor(address _rocketStorageAddress) RocketMinipoolBase(_rocketStorageAddress) public {}


    /*** Node methods ********/


    /// @dev Set the ether / rpl deposit and check it
    function nodeDeposit() public payable isNodeContract(msg.sender) returns(bool) {
        // Check the RPL exists in the minipool now, should have been sent before the ether
        require(rplContract.balanceOf(address(this)) >= node.depositRPL, "RPL deposit size does not match the minipool amount set when it was created.");
        // Check it is the correct amount passed when the minipool was created
        require(msg.value == node.depositEther, "Ether deposit size does not match the minipool amount set when it was created.");
        // Check that the node operator has not already deposited
        require(node.depositExists == false, "Node owner has already made deposit for this minipool.");
        // Set node operator deposit flag & balance
        node.depositExists = true;
        node.balance = msg.value;
        // Fire deposit event
        emit NodeDeposit(msg.sender, msg.value, rplContract.balanceOf(address(this)), now);
        // All good
        return true;
    }


    /// @dev Withdraw ether / rpl deposit from the minipool if initialised, timed out or withdrawn
    function nodeWithdraw() public isNodeContract(msg.sender) returns(bool) {
        // Check current status
        require(status.current == 0 || status.current == 4 || status.current == 6, "Minipool is not currently allowing node withdrawals.");
        // Check node operator's deposit exists
        require(node.depositExists == true, "Node operator does not have a deposit in minipool.");
        // Get withdrawal amounts
        uint256 nodeBalance = node.balance;
        uint256 etherAmount = 0;
        uint256 rethAmount = 0;
        uint256 rplAmount = rplContract.balanceOf(address(this));
        // Update node operator deposit flag & balance
        node.depositExists = false;
        node.balance = 0;
        // Transfer RPL balance to node contract
        if (rplAmount > 0) { require(rplContract.transfer(node.contractAddress, rplAmount), "RPL balance transfer error."); }
        // Refunding ether to node contract if initialised or timed out
        if (status.current == 0 || status.current == 6) {
            etherAmount = nodeBalance;
            if (etherAmount > 0) { address(uint160(node.contractAddress)).transfer(etherAmount); }
        }
        // Transferring rETH to node contract if withdrawn
        else if (staking.balanceStart > 0 && staking.balanceEnd > 0) {
            rethAmount = nodeBalance.mul(staking.balanceEnd).div(staking.balanceStart);
            if (rethAmount > 0) { require(rethContract.transfer(rocketNodeContract.getRewardsAddress(), rethAmount), "rETH balance transfer error."); }
        }
        // Fire withdrawal event
        emit NodeWithdrawal(msg.sender, etherAmount, rethAmount, rplAmount, now);
        // Update the status
        RocketMinipoolInterface minipool = RocketMinipoolInterface(address(this));
        minipool.updateStatus();
        // Success
        return true;
    }


}
