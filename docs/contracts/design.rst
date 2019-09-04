###############################
Contract Design & Upgradability
###############################


************
Architecture
************

The Rocket Pool network contracts are built with upgradability in mind, using a hub-and-spoke architecture.
The central hub of the network is the ``RocketStorage`` contract, which is responsible for storing the state of the entire network.
This is implemented through the use of maps for key-value storage, and getter and setter methods for reading and writing values for a key.

The ``RocketStorage`` contract also stores the addresses of all other network contracts (keyed by name), and restricts data modification to those contracts only.
Using this architecture, the network can be upgraded by deploying new versions of an existing contract, and updating its address in storage.
This gives Rocket Pool the flexibility required to fix bugs or implement new features to improve the network.


****************************
Interacting With Rocket Pool
****************************

To begin interacting with the Rocket Pool network, first create an instance of the ``RocketStorage`` contract using `its interface <https://github.com/rocket-pool/rocketpool/blob/master/contracts/interface/RocketStorageInterface.sol>`_::

    import "RocketStorageInterface.sol";

    contract Example {

        RocketStorageInterface rocketStorage = RocketStorageInterface(0);

        constructor(address _rocketStorageAddress) public {
            rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        }

    }

The above constructor should be called with the address of the ``RocketStorage`` contract on the appropriate network.

Because of Rocket Pool's architecture, the addresses of other contracts should not be used directly, but retrieved from the blockchain before use.
Network upgrades may have occurred since the previous interaction, resulting in outdated addresses.

Other contract instances can be created using the appropriate interface taken from the `Rocket Pool repository <https://github.com/rocket-pool/rocketpool/tree/master/contracts/interface>`_, e.g.::

    import "RocketStorageInterface.sol";
    import "RocketPoolInterface.sol";

    contract Example {

        RocketStorageInterface rocketStorage = RocketStorageInterface(0);

        constructor(address _rocketStorageAddress) public {
            rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        }

        exampleMethod() public {
            address rocketPoolAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketPool")));
            RocketPoolInterface rocketPool = RocketPoolInterface(rocketPoolAddress);
            ...
        }

    }

The names of the Rocket Pool contracts, as defined in ``RocketStorage``, are:

    * ``rocketAdmin``
    * ``rocketPool``
    * ``rocketRole``
    * ``rocketNode``
    * ``rocketPIP``
    * ``rocketUpgrade``
    * ``rocketUpgradeApproval``
    * ``rocketDepositAPI``
    * ``rocketGroupAPI``
    * ``rocketNodeAPI``
    * ``rocketDeposit``
    * ``rocketDepositIndex``
    * ``rocketDepositQueue``
    * ``rocketDepositVault``
    * ``rocketGroupAccessorFactory``
    * ``rocketNodeFactory``
    * ``rocketNodeKeys``
    * ``rocketNodeTasks``
    * ``rocketNodeWatchtower``
    * ``rocketMinipoolDelegateNode``
    * ``rocketMinipoolDelegateStatus``
    * ``rocketMinipoolDelegateDeposit``
    * ``rocketMinipoolFactory``
    * ``rocketMinipoolSet``
    * ``rocketMinipoolSettings``
    * ``rocketDepositSettings``
    * ``rocketGroupSettings``
    * ``rocketNodeSettings``
    * ``rocketPoolToken``
    * ``rocketETHToken``
    * ``taskDisableInactiveNodes``
    * ``taskCalculateNodeFee``
    * ``utilMaths``
    * ``utilPublisher``
    * ``utilAddressQueueStorage``
    * ``utilBytes32QueueStorage``
    * ``utilAddressSetStorage``
    * ``utilBytes32SetStorage``
    * ``utilStringSetStorage``

Many of these are used for internal processing, and only a few are likely to be useful for extension, specifically the API contracts (``rocketGroupAPI``, ``rocketNodeAPI``, and ``rocketDepositAPI``).
The following sections cover the various API methods available; for information on methods of other contracts, consult their interfaces in the `Rocket Pool repository <https://github.com/rocket-pool/rocketpool/tree/master/contracts/interface>`_.
