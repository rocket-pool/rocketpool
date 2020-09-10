#############
Reward Tokens
#############


**************************
rETH (for regular stakers)
**************************

rETH represents a fungible, tokenized stake in the Rocket Pool network.
A user stakes in Rocket Pool by depositing ETH in exchange for rETH.
rETH holders can exit by simply exchanging their rETH for ETH.

The rETH token has a dynamic exchange rate for ETH, which is recorded by the Rocket Pool network and increases as the network earns rewards.
This means that rETH is constantly accruing value, as long as the network is operating optimally.
rETH holders can simply hold their tokens to earn a profit, and exchange them for ETH once they wish to claim their rewards.

The following example illustrates how the token is used to stake and earn rewards:

#. Alice deposits 10 ETH into Rocket Pool when the exchange rate is 1 rETH : 1 ETH. She receives 10 rETH.
#. Over the next year, the network earns rewards and increases in value by 20%. The exchange rate is now 1 rETH : 1.2 ETH.
#. Alice burns her 10 rETH via the rETH contract, and receives 12 ETH. She has exited with a 20% profit.
#. The same day, Bob deposits 10 ETH into Rocket Pool, and receives ~8.33 rETH.
#. Over the next year, the network earns rewards and increases in value by 10%. The exchange rate is now 1 rETH : 1.32 ETH.
#. Bob burns his ~8.33 rETH via the rETH contract, and receives 11 ETH. He has exited with a 10% profit.

It may take an unknown amount of time for rETH collateral to become available for exchanges, as node operators decide when to exit their validators.
For this reason, Rocket Pool provides an additional pool of collateral for rETH exchanges in the form of "excess" deposit pool balance.
Excess balance is defined simply as the amount of ETH in the deposit pool minus the capacity of all available minipools in the queue.
In other words, as long as there is a surplus of user-deposited ETH waiting to be assigned, rETH holders can burn their tokens to claim it.


*************************
nETH (for node operators)
*************************

During Phases 0 and 1 of the `Ethereum 2.0 rollout <https://docs.ethhub.io/ethereum-roadmap/ethereum-2.0/eth-2.0-phases/>`_, withdrawals from the Beacon Chain will not be implemented.
Rocket Pool aims to provide liquidity to node operators through the design of the nETH token, so they can access their rewards before Phase 2 is launched.

When a minipool's validator finishes staking on the Beacon Chain, the minipool is marked as withdrawable, and an amount of nETH equal to the node operator's share of the balance is minted to it.
The node operator can then withdraw their nETH from the minipool and close it, but only after a significant delay.
(This prevents malicious actors from attacking the Rocket Pool network by filling it with "idle" ETH.)
nETH tokens are backed by Beacon Chain ether 1:1, and should trade on the open market for slightly less than 1 ETH in value.

When Phase 2 of the Ethereum 2.0 rollout is launched, users holding nETH will be able to swap it for Beacon Chain ether via the nETH contract.
This effectively burns the nETH, removing it from circulation.
