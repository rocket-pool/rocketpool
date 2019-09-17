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
        userDepositCapacity             // The total capacity for user deposits in wei
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

**MinipoolContract**:

    * ``MinipoolContract.getNodeDetails()``:
      Get the details of the node the minipool is owned by; returns ``Promise<NodeDetails>``

    * ``MinipoolContract.getNodeOwner()``:
      Get the owner address of the node the minipool is owned by; returns ``Promise<string>``

    * ``MinipoolContract.getNodeContract()``:
      Get the contract address of the node the minipool is owned by; returns ``Promise<string>``

    * ``MinipoolContract.getNodeDepositEth()``:
      Get the amount of ether deposited by the node owner in wei; returns ``Promise<string>``

    * ``MinipoolContract.getNodeDepositRpl()``:
      Get the amount of RPL deposited by the node owner in wei; returns ``Promise<string>``

    * ``MinipoolContract.getNodeTrusted()``:
      Get the trusted status of the node when the minipool was launched; returns ``Promise<boolean>``

    * ``MinipoolContract.getNodeDepositExists()``:
      Get whether the node deposit is still in the minipool; returns ``Promise<boolean>``

    * ``MinipoolContract.getNodeBalance()``:
      Get the node owner's current deposited ether balance in wei; returns ``Promise<string>``

    * ``MinipoolContract.getNodeUserFee()``:
      Get the fraction of rewards charged to users by the node operator; returns ``Promise<number>``

    * ``MinipoolContract.getDepositCount()``:
      Get the total number of deposits assigned to the minipool; returns ``Promise<number>``

    * ``MinipoolContract.getDepositDetails(depositId)``:
      Get the details of a deposit assigned to the minipool by ID (string); returns ``Promise<DepositDetails>``

    * ``MinipoolContract.getDepositExists(depositId)``:
      Get whether the deposit with the specified ID (string) exists in the minipool; returns ``Promise<boolean>``

    * ``MinipoolContract.getDepositUserID(depositId)``:
      Get the user ID of a deposit assigned to the minipool by ID (string); returns ``Promise<string>``

    * ``MinipoolContract.getDepositGroupID(depositId)``:
      Get the group ID of a deposit assigned to the minipool by ID (string); returns ``Promise<string>``

    * ``MinipoolContract.getDepositBalance(depositId)``:
      Get the current balance of a deposit assigned to the minipool by ID (string), in wei; returns ``Promise<string>``

    * ``MinipoolContract.getDepositStakingTokensWithdrawn(depositId)``:
      Get the amount of a deposit by ID (string) withdrawn as rETH while staking, in wei; returns ``Promise<string>``

    * ``MinipoolContract.getDepositRocketPoolFee(depositId)``:
      Get the fraction of rewards charged by Rocket Pool for a deposit by ID (string); returns ``Promise<number>``

    * ``MinipoolContract.getDepositGroupFee(depositId)``:
      Get the fraction of rewards charged by the group for a deposit by ID (string); returns ``Promise<number>``

    * ``MinipoolContract.getDepositCreated(depositId)``:
      Get the time at which a deposit by ID (string) was assigned to the minipool; returns ``Promise<Date>``

    * ``MinipoolContract.getStatusDetails()``:
      Get the details of the minipool's current status; returns ``Promise<StatusDetails>``

    * ``MinipoolContract.getStatus()``:
      Get the minipool's current status code; returns ``Promise<number>``

    * ``MinipoolContract.getStatusChangedTime()``:
      Get the time at which the minipool's status was last changed; returns ``Promise<Date>``

    * ``MinipoolContract.getStatusChangedBlock()``:
      Get the block that the minipool's status was last changed at; returns ``Promise<number>``

    * ``MinipoolContract.getStakingDurationId()``:
      Get the ID of the staking duration the minipool is staking for; returns ``Promise<string>``

    * ``MinipoolContract.getStakingDuration()``:
      Get the duration in blocks that the minipool is staking for; returns ``Promise<number>``

    * ``MinipoolContract.getValidatorPubkey()``:
      Get the validator public key submitted by the node operator; returns ``Promise<string>``

    * ``MinipoolContract.getValidatorSignature()``:
      Get the validator signature submitted by the node operator; returns ``Promise<string>``

    * ``MinipoolContract.getUserDepositCapacity()``:
      Get the minipool's total capacity for user deposits in wei; returns ``Promise<string>``

    * ``MinipoolContract.getUserDepositTotal()``:
      Get the total amount of user deposits assigned to the minipool in wei; returns ``Promise<string>``

    * ``MinipoolContract.getStakingUserDepositsWithdrawn()``:
      Get the total amount of deposits withdrawn as rETH from the minipool while staking, in wei; returns ``Promise<string>``

    * ``MinipoolContract.getStakingBalanceStart()``:
      Get the total amount of ether which was deposited to the beacon chain for staking, in wei; returns ``Promise<string>``

    * ``MinipoolContract.getStakingBalanceEnd()``:
      Get the total amount of ether returned from the beacon chain after staking, in wei; returns ``Promise<string>``
