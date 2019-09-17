#####
Pools
#####


********
Overview
********

The ``pool`` module loads general minipool data from the chain.
It also provides minipool contract functionality (which loads individual minipool data).


**********
Data Types
**********

``NodeDetails`` objects define the details of the node a minipool is owned by::

    NodeDetails {
        owner           // The owner address of the node the minipool is owned by
        contract        // The node contract address of the node the minipool is owned by
        depositEth      // The amount of ether deposited by the node owner in wei
        depositRpl      // The amount of RPL deposited by the node owner in wei
        trusted         // The trusted status of the node when the minipool was launched
        depositExists   // Whether the node deposit is still in the minipool
        balance         // The node owner's current deposited ether balance in wei
        userFee         // The fraction of rewards charged to users by the node operator
    }

``DepositDetails`` objects define the details of a specific deposit assigned to a minipool::

    DepositDetails {
        exists                  // Whether the deposit exists in the minipool
        userId                  // The address of the user who made the deposit
        groupId                 // The ID of the group the deposit was made via
        balance                 // The current balance of the deposit in the minipool, in wei
        stakingTokensWithdrawn  // The amount of the deposit withdrawn as rETH while staking, in wei
        rocketPoolFee           // The fraction of rewards charged by Rocket Pool for this deposit
        groupFee                // The fraction of rewards charged by the group for this deposit
        created                 // The time that the deposit was assigned to the minipool
    }

``StatusDetails`` objects define a minipool's status::

    StatusDetails {
        status                          // The current status code of the minipool
        statusChangedTime               // The time the minipool's status was last changed
        statusChangedBlock              // The block the minipool's status was last changed at
        stakingDurationId               // The ID of the staking duration the minipool is staking for
        stakingDuration                 // The duration in blocks that the minipool is staking for
        validatorPubkey                 // The validator public key submitted by the node operator
        validatorSignature              // The validator signature submitted by the node operator
        userDepositCapacity             // The total capacity for users deposits in wei
        userDepositTotal                // The total amount of assigned user deposits in wei
        stakingUserDepositsWithdrawn    // The total amount of deposits withdrawn as rETH while staking, in wei
    }

``MinipoolContract`` objects wrap a web3 contract instance and provide methods for retrieving a minipool's information.


*******
Methods
*******

**Pool Module**:

    * ``pool.getPoolExists(address)``:
      Get whether or not a minipool with a given address exists; returns ``Promise<boolean>``

    * ``pool.getPoolCount()``:
      Get the total number of minipools; returns ``Promise<number>``

    * ``pool.getPoolAt(index)``:
      Get a minipool address by index (number); returns ``Promise<string>``

    * ``pool.getTotalEthAssigned(stakingDurationId)``:
      Get the total network ether assigned for the specified staking duration (string), in wei; returns ``Promise<string>``

    * ``pool.getTotalEthCapacity(stakingDurationId)``:
      Get the total network ether capacity for the specified staking duration (string), in wei; returns ``Promise<string>``

    * ``pool.getNetworkUtilisation(stakingDurationId)``:
      Get the current network utilisation for the specified staking duration (string) as a fraction; returns ``Promise<number>``

    * ``pool.getMinipoolContract(address)``:
      Get a contract instance for the minipool at the specified address; returns ``Promise<MinipoolContract>``
