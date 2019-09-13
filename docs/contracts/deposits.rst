.. _contracts-deposits:

########
Deposits
########


********
Overview
********

User deposits into the Rocket Pool network are made via a :ref:`Group Accessor <contracts-groups>` contract, which interacts with the ``RocketDepositAPI``.
Transactions cannot be sent to the ``RocketDepositAPI`` contract directly; they are only valid if they originate from a Group Depositor or Withdrawer.
The following information is provided for the development of custom Group Accessor contracts which will interact with it.

**Note:** the ``RocketDepositAPI`` contract address should *not* be hard-coded in custom Group Accessor contracts, but retrieved from ``RocketStorage`` dynamically.


***************
Making Deposits
***************

Deposits can be made by calling the ``RocketDepositAPI.deposit`` method with the value of the deposit, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group to deposit under (its ``RocketGroupContract`` instance address)
    * ``userID`` (*address*): The ID of the user to deposit under (e.g. the address which is making the deposit via the Group)
    * ``durationID`` (*string*): The ID of the duration to stake the deposit for

The deposit method should be called with a value as follows::

    address rocketDepositAPIAddress = rocketStorage.getAddress(keccak256(abi.encodePacked("contract.name", "rocketDepositAPI")));
    rocketDepositAPI = RocketDepositAPIInterface(rocketDepositAPIAddress);
    bool success = rocketDepositAPI.deposit.value(value)(groupID, userID, durationID);

This method returns a boolean flag to indicate success, and emits a ``Deposit`` event with a 32-byte ``depositID`` property corresponding to the ID of the new deposit.


******************
Refunding Deposits
******************

Queued deposits (or portions of deposits still remaining in the queue) can be refunded with the ``RocketDepositAPI.depositRefundQueued`` method, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group the deposit was made under
    * ``userID`` (*address*): The ID of the user the deposit was made by
    * ``durationID`` (*string*): The ID of the duration the deposit was staked for
    * ``depositID`` (*bytes32*): The ID of the deposit

Deposits in stalled minipools can be refunded with the ``RocketDepositAPI.depositRefundMinipoolStalled`` method, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group the deposit was made under
    * ``userID`` (*address*): The ID of the user the deposit was made by
    * ``depositID`` (*bytes32*): The ID of the deposit
    * ``minipool`` (*address*): The address of the stalled minipool

Both methods transfer the refunded ether to the Depositor contract the transaction was sent to, which is responsible for transferring it to the user.
They return the amount which was refunded, and emit a ``DepositRefund`` event with the deposit's details.


********************
Withdrawing Deposits
********************

Deposits (plus rewards) can be withdrawn from minipools which have finished staking with the ``RocketDepositAPI.depositWithdrawMinipool`` method, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group the deposit was made under
    * ``userID`` (*address*): The ID of the user the deposit was made by
    * ``depositID`` (*bytes32*): The ID of the deposit
    * ``minipool`` (*address*): The address of the minipool

Deposits can be withdrawn early from staking minipools (forfeiting rewards and with a penalty) with the ``RocketDepositAPI.depositWithdrawMinipoolStaking`` method, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group the deposit was made under
    * ``userID`` (*address*): The ID of the user the deposit was made by
    * ``depositID`` (*bytes32*): The ID of the deposit
    * ``minipool`` (*address*): The address of the minipool
    * ``amount`` (*uint256*): The amount of the deposit to withdraw from the minipool in wei

Both methods transfer the withdrawn rETH to the Withdrawer contract the transaction was sent to, which is responsible for transferring it to the user.
They return the amount which was withdrawn, and emit a ``DepositWithdraw`` event with the deposit's details.


***************************
Backup Withdrawal Addresses
***************************

Backup withdrawal addresses can be set for deposits, allowing users to withdraw from an alternate address after staking in the case of lost keys for their primary account.
This is performed via the ``RocketDepositAPI.setDepositBackupWithdrawalAddress`` method, accepting the following parameters:

    * ``groupID`` (*address*): The ID of the Group the deposit was made under
    * ``userID`` (*address*): The ID of the user the deposit was made by
    * ``depositID`` (*bytes32*): The ID of the deposit
    * ``backup`` (*address*): The backup withdrawal address to set for the deposit

This method returns a boolean flag to indicate success, and emits a ``DepositSetBackupAddress`` event with the deposit's updated details.
After assigning a backup withdrawal address, users should be able to withdraw their deposit by sending a transaction from it to the Withdrawer contract's withdrawal method.
