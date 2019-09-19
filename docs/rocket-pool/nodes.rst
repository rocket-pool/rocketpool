#####
Nodes
#####


********
Overview
********

Nodes are the workhorses of the Rocket Pool network.
Anyone can register as a node with Rocket Pool, and begin staking.
When a node operator wants to stake, they deposit 16 ETH into Rocket Pool, which is matched with 16 ETH of user deposits.
The node performs all of the validation duties required by the Ethereum network, and earns a percentage of the users' rewards as compensation.

Nodes constantly check in with the network to indicate that they are doing their job.
If a node fails to check in for a long time, it will be deactivated by other nodes.
This won't prevent it from validating (in case it still is), but will stop users from being assigned to any new minipools it creates.


*************
The RPL Token
*************

Nodes must also deposit an amount of RPL (Rocket Pool tokens) in order to stake.
RPL is a token designed to regulate the capacity of the Rocket Pool network.

The amount of RPL required for a deposit adjusts dynamically based on demand for node operators.
During periods of low utilisation (when there are lots of available minipools and the network doesn't need more), the RPL required to stake is higher.
During periods of high utilisation (when there are few available minipools left and more are needed for users), the RPL required is lower, and can even drop to zero.

Node operators get their RPL back once their minipools finish staking and they withdraw from them.
It is "locked up" while staking, rather than spent permanently.
This means that node operators only need to buy more RPL if they intend to stake more ether at the same time.


************
The Node Fee
************

The fee charged to users by node operators is determined democratically by the whole network, rather than being different for each individual operator.
This ensures that user deposits don't get assigned to a node which is charging more than others.

When nodes check in with the network, they also vote to increase or decrease the current node fee (or leave it as is).
Every 24 hours, the number of votes for each option is tallied, the winning vote is enacted, and a new voting cycle begins.
The node fee only increases or decreases by 0.5% at a time, in order to prevent large swings in the fee.

Node operators are naturally incentivised to increase the fee to a certain level to maximise their profits.
However, increasing it too high would mean that users stop using the network and node operators start losing ether.
In this way, the network reaches a natural equilibrium.


****************
Watchtower Nodes
****************

Some special nodes owned by Rocket Pool and trusted partners are designated as "watchtower" nodes.
Watchtower nodes are responsible for reporting the Beacon Chain state back to the PoW chain.

Specifically, they report when a minipool's validator on the Beacon Chain exits, and when it is ready for withdrawal.
The minipool is updated accordingly, so that the Rocket Pool network can track its progress.
When it's ready for withdrawal, the watchtower node also mints rETH to the minipool matching the validator's final balance, which can be withdrawn by users and the node operator.
