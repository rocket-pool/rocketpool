.. _contracts-deposits:

########
Deposits
########


********
Overview
********

The main reason for extending the Rocket Pool network is to implement custom deposit logic which funnels user deposits into the deposit pool.
For example, a fund manager may wish to stake their users' ETH in Rocket Pool via their own smart contracts, and abstract the use of Rocket Pool itself away from their users.

**Note:** the ``RocketDepositPool`` contract address should *not* be hard-coded in your contracts, but retrieved from ``RocketStorage`` dynamically.
See :ref:`Interacting With Rocket Pool <contracts-design-interacting>` for more details.


.. _contracts-deposits-implementation:

**************
Implementation
**************

The following describes a basic example contract which forwards deposited ETH into Rocket Pool and minted rETH back to the caller::

    import "RocketStorageInterface.sol";
    import "RocketDepositPoolInterface.sol";
    import "RocketTokenRETHInterface.sol";

    contract Example {

        RocketStorageInterface rocketStorage = RocketStorageInterface(0);

        constructor(address _rocketStorageAddress) public {
            rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        }

        receive() external payable {
            // Check deposit amount
            require(msg.value > 0, "Invalid deposit amount");
            // Load contracts
            address rocketDepositPoolAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDepositPool")));
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(rocketDepositPoolAddress);
            address rocketTokenRETHAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketTokenRETH")));
            RocketTokenRETHInterface rocketTokenRETH = RocketTokenRETHInterface(rocketTokenRETHAddress);
            // Forward deposit to RP & get amount of rETH minted
            uint256 rethBalance1 = rocketTokenRETH.balanceOf(address(this));
            rocketDepositPool.deposit{value: msg.value}();
            uint256 rethBalance2 = rocketTokenRETH.balanceOf(address(this));
            require(rethBalance2 > rethBalance1, "No rETH was minted");
            uint256 rethMinted = rethBalance2 - rethBalance1;
            // Transfer rETH to caller
            require(rocketTokenRETH.transfer(msg.sender, rethMinted), "rETH was not transferred to caller");
        }

    }
