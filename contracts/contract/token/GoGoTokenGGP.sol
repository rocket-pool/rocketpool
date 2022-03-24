pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../RocketBase.sol";
import "../../interface/dao/protocol/settings/RocketDAOProtocolSettingsInflationInterface.sol";
import "../../interface/token/GoGoTokenGGPInterface.sol";
import "../../interface/RocketVaultInterface.sol";

// GGP Governance and utility token
// Inlfationary with rate determined by DAO

contract GoGoTokenGGP is RocketBase, ERC20Burnable, GoGoTokenGGPInterface {

    // Libs
    using SafeMath for uint;

    /**** Properties ***********/

    // How many GGP tokens minted to date (18m from fixed supply)
    uint256 constant totalInitialSupply = 18000000000000000000000000;
    // The GGP inflation interval
    uint256 constant inflationInterval = 1 days;
    // How many GGP tokens have been swapped for new ones
    uint256 public totalSwappedGGP = 0;

    // Timestamp of last block inflation was calculated at
    uint256 private inflationCalcTime = 0;


    /**** Contracts ************/

    // The address of our fixed supply GGP ERC20 token contract
    IERC20 ggpFixedSupplyContract = IERC20(address(0));


    /**** Events ***********/

    event GGPInflationLog(address sender, uint256 value, uint256 inflationCalcTime);
    event GGPFixedSupplyBurn(address indexed from, uint256 amount, uint256 time);
    event MintGGPToken(address _minter, address _address, uint256 _value);


    // Construct
    constructor(RocketStorageInterface _rocketStorageAddress, IERC20 _GoGoTokenGGPFixedSupplyAddress) RocketBase(_rocketStorageAddress) ERC20("GoGoPool  Protocol", "GGP") {
        // Version
        version = 1;
        // Set the mainnet GGP fixed supply token address
        ggpFixedSupplyContract = IERC20(_GoGoTokenGGPFixedSupplyAddress);
        // Mint the 18m tokens that currently exist and allow them to be sent to people burning existing fixed supply GGP
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
            IERC20 ggpInflationContract = IERC20(address(this));
            // Get the current allowance for Rocket Vault
            uint256 vaultAllowance = ggpFixedSupplyContract.allowance(rocketVaultAddress, address(this));
            // Now allow Rocket Vault to move those tokens, we also need to account of any other allowances for this token from other contracts in the same block
            require(ggpInflationContract.approve(rocketVaultAddress, vaultAllowance.add(newTokens)), "Allowance for Rocket Vault could not be approved");
            // Let vault know it can move these tokens to itself now and credit the balance to the GGP rewards pool contract
            rocketVaultContract.depositToken("rocketRewardsPool", IERC20(address(this)), newTokens);
        }
        // Log it
        emit GGPInflationLog(msg.sender, newTokens, inflationCalcTime);
        // return number minted
        return newTokens;
    }   

   /**
   * @dev Swap current GGP fixed supply tokens for new GGP 1:1 to the same address from the user calling it
   * @param _amount The amount of GGP fixed supply tokens to swap
   */
    function faucetMint(address _to, uint256 _amount) override external returns(bool) {
        // Valid amount?
        require(_amount > 0, "Please enter valid amount of GGP to swap");
        // Send the tokens to this contract now and mint new ones for them
//        require(ggpFixedSupplyContract.transferFrom(msg.sender, address(this), _amount), "Token transfer from existing GGP contract was not successful");
        // Transfer from the contracts GGP balance to the user
//        require(this.transfer(msg.sender, _amount), "Token transfer from GGP inflation contract was not successful");
        // Update the total swapped

        _mint(_to, _amount);

        totalSwappedGGP = totalSwappedGGP.add(_amount);
        emit MintGGPToken(msg.sender, _to, _amount);

        return true;
        // Log it
//        emit GGPFixedSupplyBurn(msg.sender, _amount, block.timestamp);
    }
}
