pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "../RocketBase.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInflationInterface.sol";
import "../../interface/token/RocketTokenRPLInterface.sol";
import "../../interface/RocketVaultInterface.sol";
import "../util/ERC20Burnable.sol";
import "../util/SafeMath.sol";

// RPL Governance and utility token
// Inlfationary with rate determined by DAO

contract RocketTokenRPL is RocketBase, ERC20Burnable, RocketTokenRPLInterface {

    // Libs
    using SafeMath for uint;

    /**** Properties ***********/

    // How many RPL tokens minted to date (18m from fixed supply)
    uint256 constant totalInitialSupply = 18000000000000000000000000;
    // The RPL inflation interval
    uint256 constant inflationInterval = 1 days;
    // How many RPL tokens have been swapped for new ones
    uint256 public totalSwappedRPL = 0;

    // Timestamp of last block inflation was calculated at
    uint256 private inflationCalcTime = 0;


    /**** Contracts ************/

    // The address of our fixed supply RPL ERC20 token contract
    IERC20 rplFixedSupplyContract = IERC20(address(0));


    /**** Events ***********/

    event RPLInflationLog(address sender, uint256 value, uint256 inflationCalcTime);
    event RPLFixedSupplyBurn(address indexed from, uint256 amount, uint256 time);


    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, IERC20 _rocketTokenRPLFixedSupplyAddress) RocketBase(_rocketStorageAddress) ERC20("Rocket Pool Protocol", "RPL") {
        // Version
        version = 1;
        // Set the mainnet RPL fixed supply token address
        rplFixedSupplyContract = IERC20(_rocketTokenRPLFixedSupplyAddress);
        // Mint the 18m tokens that currently exist and allow them to be sent to people burning existing fixed supply RPL
        _mint(address(this), totalInitialSupply);
    }

    /**
    * Get the last time that inflation was calculated at
    * @return uint256 Last timestamp since inflation was calculated
    */
    function getInflationCalcTime() override public view returns(uint256) {
        // Get the last time inflation was calculated if it has even started
        uint256 inflationStartTime = getInflationIntervalStartTime();
        // If inflation has just begun but not been calculated previously, use the start block as the last calculated point if it has passed
        return inflationCalcTime == 0 && inflationStartTime < block.timestamp ? inflationStartTime : inflationCalcTime;
    }

    /**
    * How many seconds to calculate inflation at
    * @return uint256 how many seconds to calculate inflation at
    */
    function getInflationIntervalTime() override external pure returns(uint256) {
        return inflationInterval;
    }

    /**
    * The current inflation rate per interval (eg 1000133680617113500 = 5% annual)
    * @return uint256 The current inflation rate per interval
    */
    function getInflationIntervalRate() override public view returns(uint256) {
        // Inflation rate controlled by the DAO
        RocketDAOProtocolSettingsInflationInterface daoSettingsInflation = RocketDAOProtocolSettingsInflationInterface(getContractAddress("rocketDAOProtocolSettingsInflation"));
        return daoSettingsInflation.getInflationIntervalRate();
    }

    /**
    * The current block to begin inflation at
    * @return uint256 The current block to begin inflation at
    */
    function getInflationIntervalStartTime() override public view returns(uint256) {
        // Inflation rate start time controlled by the DAO
        RocketDAOProtocolSettingsInflationInterface daoSettingsInflation = RocketDAOProtocolSettingsInflationInterface(getContractAddress("rocketDAOProtocolSettingsInflation"));
        return daoSettingsInflation.getInflationIntervalStartTime();
    }

    /**
    * The current rewards pool address that receives the inflation
    * @return address The rewards pool contract address
    */
    function getInflationRewardsContractAddress() override external view returns(address) {
        // Inflation rate start block controlled by the DAO
        return getContractAddress("rocketRewardsPool");
    }


    /**
    * Compute interval since last inflation update (on call)
    * @return uint256 Time intervals since last update
    */
    function getInflationIntervalsPassed() override public view returns(uint256) {
        // The time that inflation was last calculated at
        uint256 inflationLastCalculatedTime = getInflationCalcTime();
        return _getInflationIntervalsPassed(inflationLastCalculatedTime);
    }

    function _getInflationIntervalsPassed(uint256 _inflationLastCalcTime) private view returns(uint256) {
        // Calculate now if inflation has begun
        if(_inflationLastCalcTime > 0) {
            return (block.timestamp).sub(_inflationLastCalcTime).div(inflationInterval);
        }else{
            return 0;
        }
    }


    /**
    * @dev Function to compute how many tokens should be minted
    * @return A uint256 specifying number of new tokens to mint
    */
    function inflationCalculate() override external view returns (uint256) {
        uint256 intervalsSinceLastMint = getInflationIntervalsPassed();
        return _inflationCalculate(intervalsSinceLastMint);
    }

    function _inflationCalculate(uint256 _intervalsSinceLastMint) private view returns (uint256) {
        // The inflation amount
        uint256 inflationTokenAmount = 0;
        // Only update  if last interval has passed and inflation rate is > 0
        if(_intervalsSinceLastMint > 0) {
            // Optimisation
            uint256 inflationRate = getInflationIntervalRate();
            if(inflationRate > 0) {
                // Get the total supply now
                uint256 totalSupplyCurrent = totalSupply();
                uint256 newTotalSupply = totalSupplyCurrent;
                // Compute inflation for total inflation intervals elapsed
                for (uint256 i = 0; i < _intervalsSinceLastMint; i++) {
                    newTotalSupply = newTotalSupply.mul(inflationRate).div(10**18);
                }
                // Return inflation amount
                inflationTokenAmount = newTotalSupply.sub(totalSupplyCurrent);
            }
        }
        // Done
        return inflationTokenAmount;
    }


    /**
    * @dev Mint new tokens if enough time has elapsed since last mint
    * @return A uint256 specifying number of new tokens that were minted
    */
    function inflationMintTokens() override external returns (uint256) {
        // Only run inflation process if at least 1 interval has passed (function returns 0 otherwise)
        uint256 inflationLastCalcTime = getInflationCalcTime();
        uint256 intervalsSinceLastMint = _getInflationIntervalsPassed(inflationLastCalcTime);
        if (intervalsSinceLastMint == 0) {
            return 0;
        }
        // Address of the vault where to send tokens
        address rocketVaultAddress = getContractAddress("rocketVault");
        require(rocketVaultAddress != address(0x0), "rocketVault address not set");
        // Only mint if we have new tokens to mint since last interval and an address is set to receive them
        RocketVaultInterface rocketVaultContract = RocketVaultInterface(rocketVaultAddress);
        // Calculate the amount of tokens now based on inflation rate
        uint256 newTokens = _inflationCalculate(intervalsSinceLastMint);
        // Update last inflation calculation timestamp even if inflation rate is 0
        inflationCalcTime = inflationLastCalcTime.add(inflationInterval.mul(intervalsSinceLastMint));
        // Check if actually need to mint tokens (e.g. inflation rate > 0)
        if (newTokens > 0) {
            // Mint to itself, then allocate tokens for transfer to rewards contract, this will update balance & supply
            _mint(address(this), newTokens);
            // Initialise itself and allow from it's own balance (cant just do an allow as it could be any user calling this so they are msg.sender)
            IERC20 rplInflationContract = IERC20(address(this));
            // Get the current allowance for Rocket Vault
            uint256 vaultAllowance = rplFixedSupplyContract.allowance(rocketVaultAddress, address(this));
            // Now allow Rocket Vault to move those tokens, we also need to account of any other allowances for this token from other contracts in the same block
            require(rplInflationContract.approve(rocketVaultAddress, vaultAllowance.add(newTokens)), "Allowance for Rocket Vault could not be approved");
            // Let vault know it can move these tokens to itself now and credit the balance to the RPL rewards pool contract
            rocketVaultContract.depositToken("rocketRewardsPool", IERC20(address(this)), newTokens);
        }
        // Log it
        emit RPLInflationLog(msg.sender, newTokens, inflationCalcTime);
        // return number minted
        return newTokens;
    }   

   /**
   * @dev Swap current RPL fixed supply tokens for new RPL 1:1 to the same address from the user calling it
   * @param _amount The amount of RPL fixed supply tokens to swap
   */
    function swapTokens(uint256 _amount) override external {
        // Valid amount?
        require(_amount > 0, "Please enter valid amount of RPL to swap");
        // Send the tokens to this contract now and mint new ones for them
        require(rplFixedSupplyContract.transferFrom(msg.sender, address(this), _amount), "Token transfer from existing RPL contract was not successful");
        // Transfer from the contracts RPL balance to the user
        require(this.transfer(msg.sender, _amount), "Token transfer from RPL inflation contract was not successful");
        // Update the total swapped
        totalSwappedRPL = totalSwappedRPL.add(_amount);
        // Log it
        emit RPLFixedSupplyBurn(msg.sender, _amount, block.timestamp);
    }
}
