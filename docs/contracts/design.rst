.. _contracts-design:

###############################
Contract Design & Upgradability
###############################


.. _contracts-design-architecture:

************
Architecture
************

The Rocket Pool network contracts are built with upgradability in mind, using a hub-and-spoke architecture.
The central hub of the network is the ``RocketStorage`` contract, which is responsible for storing the state of the entire network.
This is implemented through the use of maps for key-value storage, and getter and setter methods for reading and writing values for a key.

The ``RocketStorage`` contract also stores the addresses of all other network contracts (keyed by name), and restricts data modification to those contracts only.
Using this architecture, the network can be upgraded by deploying new versions of an existing contract, and updating its address in storage.
This gives Rocket Pool the flexibility required to fix bugs or implement new features to improve the network.


.. _contracts-design-interacting:

****************************
Interacting With Rocket Pool
****************************

To begin interacting with the Rocket Pool network, first create an instance of the ``RocketStorage`` contract using `its interface <https://github.com/rocket-pool/rocketpool/blob/master/contracts/interface/RocketStorageInterface.sol>`_::

    import "RocketStorageInterface.sol";

    contract Example {

        RocketStorageInterface rocketStorage = RocketStorageInterface(0);

        constructor(address _rocketStorageAddress) {
            rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        }

    }

The above constructor should be called with the address of the ``RocketStorage`` contract on the appropriate network.

Because of Rocket Pool's architecture, the addresses of other contracts should not be used directly, but retrieved from the blockchain before use.
Network upgrades may have occurred since the previous interaction, resulting in outdated addresses.

Other contract instances can be created using the appropriate interface taken from the `Rocket Pool repository <https://github.com/rocket-pool/rocketpool/tree/master/contracts/interface>`_, e.g.::

    import "RocketStorageInterface.sol";
    import "RocketDepositPoolInterface.sol";

    contract Example {

        RocketStorageInterface rocketStorage = RocketStorageInterface(0);

        constructor(address _rocketStorageAddress) {
            rocketStorage = RocketStorageInterface(_rocketStorageAddress);
        }

        exampleMethod() public {
            address rocketDepositPoolAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDepositPool")));
            RocketDepositPoolInterface rocketDepositPool = RocketDepositPoolInterface(rocketDepositPoolAddress);
            ...
        }

    }

The Rocket Pool contracts, as defined in ``RocketStorage``, are:

    * ``rocketRole`` - Handles assignment of privileged admin roles (internal)
    * ``rocketVault`` - Stores ETH held by network contracts (internal, not upgradeable)
    * ``rocketUpgrade`` - Provides upgrade functionality for the network (internal)

    * ``rocketDepositPool`` - Accepts user-deposited ETH and handles assignment to minipools

    * ``rocketMinipoolFactory`` - Creates minipool contract instances (internal)
    * ``rocketMinipoolManager`` - Creates & manages all minipools in the network
    * ``rocketMinipoolQueue`` - Organises minipools into a queue for ETH assignment
    * ``rocketMinipoolStatus`` - Handles minipool status updates from watchtower nodes

    * ``rocketNetworkBalances`` - Handles network balance updates from watchtower nodes
    * ``rocketNetworkFees`` - Calculates node commission rates based on network node demand
    * ``rocketNetworkWithdrawal`` - Handles processing of beacon chain validator withdrawals

    * ``rocketNodeDeposit`` - Handles node deposits for minipool creation
    * ``rocketNodeManager`` - Registers & manages all nodes in the network

    * ``rocketDepositSettings`` - Provides network settings relating to deposits
    * ``rocketMinipoolSettings`` - Provides network settings relating to minipools
    * ``rocketNetworkSettings`` - Provides miscellaneous network settings
    * ``rocketNodeSettings`` - Provides network settings relating to nodes

    * ``rocketTokenRETH`` - The rETH token contract (not upgradeable)
    * ``rocketTokenNETH`` - The nETH token contract (not upgradeable)

    * ``addressQueueStorage`` - A utility contract (internal)
    * ``addressSetStorage`` - A utility contract (internal)

Contracts marked as "internal" do not provide methods which are accessible to the general public, and so are generally not useful for extension.
For information on specific contract methods, consult their interfaces in the `Rocket Pool repository <https://github.com/rocket-pool/rocketpool/tree/master/contracts/interface>`_.
