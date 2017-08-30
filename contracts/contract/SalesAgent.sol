pragma solidity ^0.4.11;

import "../RocketPoolToken.sol";

/// @title An sales agent for token sales contracts (ie crowdsale, presale, quarterly sale etc)
/// @author David Rugendyke - http://www.rocketpool.net

contract SalesAgent {

     /**** Properties ***********/

    address tokenContractAddress;                           // Main contract token address
    mapping (address => uint256) public contributions;      // Contributions per address  
    uint256 public contributedTotal;                        // Total ETH contributed                   

    /**** Modifiers ***********/

    /// @dev Only allow access from the main token contract
    modifier onlyTokenContract() {
        assert(tokenContractAddress != 0 && msg.sender == tokenContractAddress);
        _;
    }

    /*** Events ****************/

    event Contribute(address _agent, address _sender, uint256 _value);
    event FinaliseSale(address _agent, address _sender, uint256 _value);
    event Refund(address _agent, address _sender, uint256 _value);
    event ClaimTokens(address _agent, address _sender, uint256 _value); 
    event TransferToDepositAddress(address _agent, address _sender, uint256 _value);

    /*** Tests *****************/

    event FlagInt(int256 flag);
    event FlagUint(uint256 flag);
    event FlagAddress(address flag);

    /*** Methods ****************/
    
    /// @dev Get the contribution total of ETH from a contributor
    /// @param _owner The owners address
    function getContributionOf(address _owner) constant returns (uint256 balance) {
        return contributions[_owner];
    }

    /// @dev The address used for the depositAddress must checkin with the contract to verify it can interact with this contract, must happen or it won't accept funds
    function setDepositAddressVerify() public {
        // Get the token contract
        RocketPoolToken rocketPoolToken = RocketPoolToken(tokenContractAddress);
        // Is it the right address? Will throw if incorrect
        rocketPoolToken.setSaleContractDepositAddressVerified(msg.sender);
    }

}