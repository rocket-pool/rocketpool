pragma solidity 0.6.12;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
//import "../../interface/token/RocketTokenNETHInterface.sol";

// RPL Governance and utility token
// Inlfationary with rate determined by DAO

contract RocketTokenRPL is RocketBase, ERC20 {

    /**** Properties ***********/

    // How many RPL tokens minted to date (18m from fixed supply)
    uint256 public totalInitialSupply = 18000000000000000000000000;
    // How many RPL tokens have been swapped for new ones
    uint256 public totalSwappedRPL = 0;

    // Last block inflation was calculated at
    uint256 private inflationCalcBlock = 0;


    /**** Contracts ************/

    // The address of our fixed supply RPL ERC20 token contract
    IERC20 rplFixedSupplyContract = IERC20(address(0));      


    /**** Events ***********/
    
    event InflationLog(string logString, uint256 value, uint256 time);
    event RPLFixedSupplyBurn(address indexed from, uint256 amount, uint256 time);


    // Construct
    constructor(address _rocketStorageAddress, address _rocketTokenRPLFixedSupplyAddress) RocketBase(_rocketStorageAddress) ERC20("Rocket Pool", "RPL") public {
        // Version
        version = 1;
        // Set the mainnet RPL fixed supply token address
        rplFixedSupplyContract = IERC20(_rocketTokenRPLFixedSupplyAddress);
        // Mint the 18m tokens that currently exist and allow them to be sent to people burning existing fixed supply RPL
        _mint(address(this), totalInitialSupply);
    }

    /**
    * Get the last block that inflation was calculated at
    * @return uint256 Last block since inflation was calculated
    */
    function getinflationCalcBlockBlock() public view returns(uint256) {
        return inflationCalcBlock;
    }

    /**
    * How many blocks to calculate inflation at (5760 = 1 day in 15sec blocks)
    * @return uint256 ow many blocks to calculate inflation at
    */
    function getInflationIntervalBlocks() public view returns(uint256) {
        return getUintS("settings.dao.rpl.inflation.interval.blocks");
    }

    /**
    * The current inflation rate per interval (eg 1000133680617113500 = 5% annual)
    * @return uint256 The current inflation rate per interval
    */
    function getInflationIntervalRate() public view returns(uint256) {
        // Inflation rate controlled by the DAO
        return getUintS("settings.dao.rpl.inflation.interval.rate");
    }

    /**
    * Compute interval since last inflation update (on call)
    * @return uint256 Time intervals since last update
    */
    function getInlfationIntervalsPassed() public view returns(uint256) {
        // Get the last time inflation was calculated if it has even started
        uint256 inflationStartBlock = getInflationIntervalStartBlock();
        // The block that inflation was last calculated at - if inflation has just begun but not been calculated previously, use the start block as the last calculated point
        uint256 inflationLastCalculatedBlock = inflationCalcBlock == 0 && inflationStartBlock <= block.number ? inflationStartBlock : inflationCalcBlock;
        // Get the daily inflation in blocks
        uint256 inflationInterval = getInflationIntervalBlocks();
        // Calculate now if inflation has begun
        if(inflationStartBlock <= block.number && inflationLastCalculatedBlock > 0) {
            return (block.number.div(inflationInterval)).sub(inflationCalcBlock.div(inflationInterval));
        }else{
            return 0;
        }
    }

    /**
    * The current block to begin inflation at
    * @return uint256 The current block to begin inflation at
    */
    function getInflationIntervalStartBlock() public view returns(uint256) {
        // Inflation rate start block controlled by the DAO
        return getUintS("settings.dao.rpl.inflation.interval.start");
    }


    /**
    * @dev Function to compute how many tokens should be minted
    * @return A uint256 specifying number of new tokens to mint
    */
    function inflationCalculate() public view returns (uint256) {
        // The inflation amount
        uint256 inflationTokenAmount = 0;
        // Optimisation
        uint256 inflationRate = getInflationIntervalRate();
        // Compute the number of inflationInterval elapsed since the last time we minted infation tokens
        uint256 intervalsSinceLastMint = getInlfationIntervalsPassed();
        // Only update  if last interval has passed and inflation rate is > 0
        if(intervalsSinceLastMint > 0 && inflationRate > 0) {
            // Our inflation rate
            uint256 rate = inflationRate; 
            // Compute inflation for total inflationIntervals elapsed
            for (uint256 i = 1; i < intervalsSinceLastMint; i++) {
                rate = rate.mul(inflationRate).div(10 ** 18);
            }
            // Get the total supply now 
            uint256 totalSupplyCurrent = totalSupply();
            // Return inflation amount
            inflationTokenAmount = totalSupplyCurrent.mul(rate).div(10 ** 18).sub(totalSupplyCurrent);
        }
        // Done
        return inflationTokenAmount;
    }

    /**
    * @dev Mint new tokens if enough time has elapsed since last mint
    * @param _to Address where new tokens should be sent
    */
    function inflationMintTokens(address _to) onlyOwner public returns (bool) {
        // Calculate the amount of tokens now based on inflation rate
        uint256 newTokens = inflationCalculate();
        // Only mint if we have new tokens to mint since last interval
        if(newTokens > 0) {
            // Update last inflation calculation block
            inflationCalcBlock = block.number;
            // Update balance & supply
            _mint(_to, newTokens);
            // Transfer now
            Transfer(address(0), _to, newTokens);
            // Done
            return true;
        }else{
            // No tokens minted
            return false;
        }
    }

   /**
   * @dev Swap current RPL fixed supply tokens for new RPL 1:1 to the same address from the user calling it
   * @param _amount The amount of RPL fixed supply tokens to swap
   */
    function swapTokens(uint256 _amount) external {
        // Valid amount?
        require(_amount > 0, "Please enter valid amount of RPL to swap");
        // Check they have a valid amount to swap from
        require(rplFixedSupplyContract.balanceOf(address(msg.sender)) > 0, "No existing RPL fixed supply tokens available to swap");
        // Check they can cover the amount
        require(rplFixedSupplyContract.balanceOf(address(msg.sender)) >= _amount, "Not enough RPL fixed supply tokens available to cover swap amount desired");
        // Check they have allowed this contract to send their tokens
        uint256 allowance = rplFixedSupplyContract.allowance(msg.sender, address(this));
        // Enough to cover it?
        require(allowance >= _amount, "Not enough allowance given for transfer of tokens");
        // Check address is legit (impossible, but safety first)
        require(msg.sender != address(0x0), "Sender address is not a valid address");
        // Send the tokens to this contract now and mint new ones for them
        if (rplFixedSupplyContract.transferFrom(msg.sender, address(this), _amount)) {
            // Initialise itself and send from it's own balance (cant just do a transfer as it's a user calling this so they are msg.sender)
            IERC20 rplInflationContract = IERC20(address(this));
            // Transfer from the contracts RPL balance to the user
            rplInflationContract.transfer(msg.sender, _amount);
            // Update the total swapped
            totalSwappedRPL = totalSwappedRPL.add(_amount);
            // Log it
            emit RPLFixedSupplyBurn(msg.sender, _amount, now);
        }else{
            revert("Token transfer from existing RPL contract was not successful");
        }
    }


}
