#############
API Reference
#############


**************
RocketGroupAPI
**************

**Accessors:**

    * ``getGroupName(address ID)``: Get the registered name of the group with the specified ID

**Mutators:**

    * ``add(string name, uint256 stakingFee)``: Register a group with Rocket Pool with the specified name and staking fee (the percentage of rewards to charge the group's users, as a fraction of 1 ether, in wei)
    * ``createDefaultAccessor(address ID)``: Create a default group accessor contract for the group with the specified ID (must be registered with ``RocketGroupContract.addDepositor`` & ``RocketGroupContract.addWithdrawer``)


*******************
RocketGroupContract
*******************

**Accessors:**

    * ``getOwner()``: Get the address of the group's owner
    * ``getFeePerc()``: Get the percentage of rewards to charge the group's users, as a fraction of 1 ether, in wei
    * ``getFeePercRocketPool()``: Get the percentage of rewards charged to the group's users by Rocket Pool, as a fraction of 1 ether, in wei
    * ``getFeeAddress()``: Get the address to send the group's fees to (default: the account which registered the group)
    * ``hasDepositor(address value)``: Returns true if the group has a registered depositor contract with the specified address
    * ``hasWithdrawer(address value)``: Returns true if the group has a registered withdrawer contract with the specified address

**Mutators (restricted to group owner):**

    * ``setFeePerc(uint256 value)``: Update the percentage of rewards to charge the group's users, as a fraction of 1 ether, in wei (does not affect any currently assigned deposits)
    * ``setFeeAddress(address value)``: Update the address to send the group's fees to (default: the account which registered the group)
    * ``addDepositor(address value)``: Add a depositor contract to the group; emits ``DepositorAdd``
    * ``removeDepositor(address value)``: Remove a depositor contract from the group; emits ``DepositorRemove``
    * ``addWithdrawer(address value)``: Add a withdrawer contract to the group; emits ``WithdrawerAdd``
    * ``removeWithdrawer(address value)``: Remove a withdrawer contract from the group; emits ``WithdrawerRemove``


****************
RocketDepositAPI
****************

**Mutators (restricted to group depositors):**

    * ``deposit(address groupID, address userID, string durationID)``: Deposit into Rocket Pool for the specified staking duration; emits ``Deposit``
    * ``depositRefundQueued(address groupID, address userID, string durationID, bytes32 depositID)``: Refund a queued deposit or portion of a deposit; emits ``DepositRefund``
    * ``depositRefundMinipoolStalled``
      ``(address groupID, address userID, bytes32 depositID, address minipool)``: Refund a deposit from a stalled minipool; emits ``DepositRefund``

**Mutators (restricted to group withdrawers):**

    * ``depositWithdrawMinipoolStaking``
      ``(address groupID, address userID, bytes32 depositID, address minipool, uint256 amount)``: Withdraw early from a staking minipool; emits ``DepositWithdraw``
    * ``depositWithdrawMinipool(address groupID, address userID, bytes32 depositID, address minipool)``: Withdraw from a minipool which has finished staking; emits ``DepositWithdraw``
    * ``setDepositBackupWithdrawalAddress``
      ``(address groupID, address userID, bytes32 depositID, address backup)``: Set a backup withdrawal address for a deposit; emits ``DepositSetBackupAddress``
