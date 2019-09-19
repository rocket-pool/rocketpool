########
Deposits
########


********
Overview
********

Deposits made into Rocket Pool are tracked closely from the moment they enter the network.
When a user makes a deposit, it gets assigned a unique ID, and all of its information is recorded.
This includes the total amount deposited, how much of it is in the deposit queue, and how much has been assigned to minipools, refunded, and withdrawn.
We also keep a list of every minipool the deposit gets assigned to along with how much of the deposit was assigned to it.


*****************
The Deposit Queue
*****************

When deposits are made into Rocket Pool, they first enter a deposit queue.
Each staking duration has its own deposit queue and is processed separately.
The queue is first-in, first-out - so whoever deposited first gets assigned to minipools first.
Whenever a deposit is made, the queue gets processed as long as there are minipools available for assignment.
It also gets processed when a node operator creates a new minipool.

If the queue is moving too slowly and a user wants to pull out, they can refund their deposit from the queue.
However, if any of their deposit has already been assigned to minipools, it's too late to withdraw that - they are locked in.

The deposit queue has a maximum size (in ether) to prevent too large of a back-log from forming.
Once the queue gets close to its maximum size, deposit sizes are limited so that they don't exceed it.
If it fills up entirely and there are no minipools available for assignment, deposits will be disabled until more are added.


********
Chunking
********

Deposits over a certain size (4 ETH) are broken into "chunks" and spread out over different minipools instead of being put in one.
This distributes risk over the network more evenly so that users stand to lose less if a node operator experiences problems.
For example, a deposit of 16 ETH would be assigned to four minipools (as long as there are at least four available) instead of one.
If a node operator owning one of those minipools has problems, only 25% of the deposit is in danger.


****
Fees
****

Fees are all taken as a percentage of the rewards that a deposit earns, never from the initial deposit itself.
Fees are primarily taken by the node operator, as they provide the computation power which earns rewards in the first place.
Rocket Pool also charge a small fee to users (not the node operator), and the group which a user deposited with may charge a fee as well.

The Rocket Pool and group fees for each deposit are "locked in" when it gets assigned to a minipool.
The node operator fee is "locked in" when the minipool begins staking on the beacon chain.
This ensures that fees can't be increased after a user has begun staking, taking more than they were comfortable with initially.

When a user withdraws from a minipool, the node operator's fee and Rocket Pool's fee are calculated and deducted first.
Then the group's fee is calculated based on the remaining rewards, and deducted.
If the minipool did not earn a profit, no fees are taken and the user is reimbursed as much as possible.


************************
Rewards & the rETH Token
************************




***************************
Backup Withdrawal Addresses
***************************

After making a deposit, a user can set a backup withdrawal address on it in case they lose access to their main address.
This allows users to withdraw using a different wallet than the one they used to make their deposit.
Withdrawals can only be made from backup addresses after a certain amount of time has passed and the deposit is still unclaimed.
