pragma solidity 0.4.19;


/// @title A shell of a contract that nodes can deploy to use as a validation contract for Casper
/// @author David Rugendyke
contract Validation {

    /**** Properties ***********/
    address public nodeOwner = msg.sender;                     // Node that created this validation contract

}
