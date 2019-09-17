#####
Nodes
#####


********
Overview
********

The ``node`` module manages nodes in the Rocket Pool network.
It loads node data from the chain, and can be used to register new nodes.
It also provides node contract functionality (for node owners to manage their node).


**********
Data Types
**********

``NodeDetails`` objects define the various details of a node::

    NodeDetails {
        owner                   // The owner address of the node
        rewardsAddress          // The address which node fees and rewards are paid to
        ethBalance              // The current ETH balance of the node contract, in wei
        rplBalance              // The current RPL balance of the node contract, in wei
        hasDepositReservation   // Whether the node has a current deposit reservation
    }

``NodeDepositReservation`` objects define deposit reservations made by the node::

    NodeDepositReservation {
        created                 // The time at which the deposit reservation was made
        etherRequired           // The ether required to complete the deposit, in wei
        rplRequired             // The RPL required to complete the deposit, in wei
        durationId              // The ID of the staking duration that the node will stake for
        validatorPubkey         // The validator public key which was submitted with the deposit reservation
        validatorSignature      // The validator signature which was submitted with the deposit reservation
    }

``NodeContract`` objects wrap a web3 contract instance and provide methods for managing a node.
Mutator methods are restricted to the node's owner.


*******
Methods
*******

**Node Module**:

    * ``node.getAvailableCount(stakingDurationId)``:
      Get the number of nodes with minipools available for assignment staking for the specified duration (string); returns ``Promise<number>``

    * ``node.getRPLRatio(stakingDurationId)``:
      Get the currentl RPL ratio by staking duration ID (string); returns ``Promise<number>``

    * ``node.getRPLRequired(weiAmount, stakingDurationId)``:
      Get the current RPL requirement in wei for the specified ether amount in wei (string), staking for the specified duration (string); returns ``Promise<[string, number]>``

    * ``node.getTrusted(nodeOwner)``:
      Get a flag indicating whether the node with the specified owner (address) is trusted; returns ``Promise<bool>``

    * ``node.getTimezoneLocation(nodeOwner)``:
      Get the timezone location of the node with the specified owner (address); returns ``Promise<string>``

    * ``node.getContractAddress(nodeOwner)``:
      Get address of the node contract with the specified owner (address); returns ``Promise<string>``

    * ``node.getContract(address)``:
      Get a contract instance for the node at the specified address; returns ``Promise<NodeContract>``

    * ``node.add(timezone, options, onConfirmation)``:
      Register a node with Rocket Pool with the specified timezone location (string); returns ``Promise<TransactionReceipt>``

    * ``node.setTimezoneLocation(timezone, options, onConfirmation)``:
      Set the timezone location (string) for a node; returns ``Promise<TransactionReceipt>``

**NodeContract**:

    * ``NodeContract.getDetails()``:
      Get the node's details; returns ``Promise<NodeDetails>``

    * ``NodeContract.getDepositReservation()``:
      Get the node's current deposit reservation details; returns ``Promise<NodeDepositReservation>``

    * ``NodeContract.getOwner()``:
      Get the owner address of the node; returns ``Promise<string>``

    * ``NodeContract.getRewardsAddress()``:
      Get the address which node fees and rewards are paid to; returns ``Promise<string>``

    * ``NodeContract.getEthBalance()``:
      Get the current ETH balance of the node contract in wei; returns ``Promise<string>``

    * ``NodeContract.getRplBalance()``:
      Get the current RPL balance of the node contract in wei; returns ``Promise<string>``

    * ``NodeContract.getHasDepositReservation()``:
      Get a flag indicating whether the node has a current deposit reservation; returns ``Promise<boolean>``

    * ``NodeContract.getDepositReservationCreated()``:
      Get the time at which the node's deposit reservation was made; returns ``Promise<Date>``

    * ``NodeContract.getDepositReservationEthRequired()``:
      Get the ether required to complete the node's current deposit reservation, in wei; returns ``Promise<string>``

    * ``NodeContract.getDepositReservationRplRequired()``:
      Get the RPL required to complete the node's current deposit reservation, in wei; returns ``Promise<string>``

    * ``NodeContract.getDepositReservationDurationId()``:
      Get the ID of the staking duration that the node's current deposit reservation will stake for; returns ``Promise<string>``

    * ``NodeContract.getDepositReservationValidatorPubkey()``:
      Get the validator public key which was submitted with the node's current deposit reservation; returns ``Promise<string>``

    * ``NodeContract.getDepositReservationValidatorSignature()``:
      Get the validator signature which was submitted with the node's current deposit reservation; returns ``Promise<string>``

    * ``NodeContract.setRewardsAddress(address, options, onConfirmation)``:
      Set the address which node fees and rewards are paid to; returns ``Promise<TransactionReceipt>``

    * ``NodeContract.reserveDeposit``
      ``(durationId, validatorPubkey, validatorSignature, options, onConfirmation)``:
      Reserve a deposit for the specified staking duration (string), with the specified validator public key and signature (strings); returns ``Promise<TransactionReceipt>``

    * ``NodeContract.cancelDepositReservation(options, onConfirmation)``:
      Cancel the node's current deposit reservation; returns ``Promise<TransactionReceipt>``

    * ``NodeContract.completeDeposit(options, onConfirmation)``:
      Complete the node's current deposit reservation; returns ``Promise<TransactionReceipt>``

    * ``NodeContract.withdrawMinipoolDeposit(minipoolAddress, options, onConfirmation)``:
      Withdraw the ETH / rETH & RPL deposit from the specified minipool which has timed out or finished staking; returns ``Promise<TransactionReceipt>``

    * ``NodeContract.withdrawEth(weiAmount, options, onConfirmation)``:
      Withdraw the specified amount of ether, in wei (string) from the node contract to the node account; returns ``Promise<TransactionReceipt>``

    * ``NodeContract.withdrawRpl(weiAmount, options, onConfirmation)``:
      Withdraw the specified amount of RPL, in wei (string) from the node contract to the node account; returns ``Promise<TransactionReceipt>``
