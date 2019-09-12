#############
API Reference
#############


*******************
RocketGroupContract
*******************

**Accessors:**

**Mutators (Restricted to Group Owner):**

    * ``setFeePerc(uint256 value)``: Update the percentage of rewards to charge the group's users (does not affect any currently assigned deposits)
    * ``setFeeAddress(address value)``: Update the address to send the group's fees to (default: the account which registered the group)
    * ``addDepositor(address value)``: Add a depositor contract to the group
    * ``removeDepositor(address value)``: Remove a depositor contract from the group
    * ``addWithdrawer(address value)``: Add a withdrawer contract to the group
    * ``removeWithdrawer(address value)``: Remove a withdrawer contract from the group
