#####
Nodes
#####


********
Overview
********

Nodes are the workhorses of the Rocket Pool network.
Anyone can register a node with Rocket Pool and begin staking.
When a node operator wants to stake, they deposit 16 or 32 ETH into Rocket Pool, which is matched with 16 user-deposited ETH.
The node performs all of the validation duties required by the Ethereum network, and earns a percentage of the rewards on the user-deposited ETH assigned to it as a commission.


***********************
The Node Commission Fee
***********************

The commission earned by a node is calculated based on network supply and demand dynamics.
When the Rocket Pool network has a large pool of user-deposited ETH and limited capacity in available minipools, node demand is high.
Conversely, when there is a small pool of user-deposited ETH and a lot of capacity in available minipools, node demand is low.

When a node makes a deposit to create a minipool, the node demand and commission rate are calculated at that moment and "locked in" for that minipool.
High node demand results in a higher commission rate, while low demand results in a lower commission rate.
The upper and lower bounds for node commission rate are recorded in Rocket Pool contracts, and will be adjustable via governance mechanics in the future.

When a node makes a deposit, they may specify a minimum commission rate they will accept for the created minipool, to account for fluctuations in the network commission rate while their transaction is mined.
If the network commission rate drops below this value before the deposit transaction is mined, it is cancelled and reverts.


****************
Watchtower Nodes
****************

Some special nodes owned by Rocket Pool and trusted partners are designated as "watchtower" nodes.
Watchtower nodes are responsible for reporting the Beacon Chain state back to the PoW chain.
A majority of watchtower nodes must reach consensus on the information being reported before it takes effect.

Firstly, they report the total value of the Rocket Pool network to the Rocket Pool contracts at set intervals.
This allows the dynamic rETH : ETH exchange rate to be updated in accordance with rewards earned.

Secondly, they report when a minipool's validator on the Beacon Chain is ready for withdrawal.
The minipool is updated accordingly, so that the Rocket Pool network can track its progress.
The network also mints nETH equal to the node operator's share of the validator's final balance to the minipool.
After a delay, the node operator can withdraw this nETH and exchange it for ETH on the open market.
After phase 2 of the Eth 2.0 rollout, it can also be burned for ETH via the nETH contract itself.

Watchtower nodes also perform some other minor tasks, such as automatically dissolving timed out minipools which fail to stake.
This prevents user-deposited ETH in the network from sitting "idle" (not earning rewards) by returning it to the deposit pool.

Finally, watchtower nodes are granted special privileges to create "empty" minipools with 0 ETH deposited by the node operator.
These minipools are assigned 32 user-deposited ETH, which the node operator can still earn a commission on the rewards for.
Empty minipools are only assigned ETH if there are no regular ones waiting in the queue - they serve as a backup if there is a shortage of node operators in the network.
