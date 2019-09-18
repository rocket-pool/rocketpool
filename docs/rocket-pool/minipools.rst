#########
Minipools
#########


********
Overview
********

Minipools are the matchmaking service at the heart of the Rocket Pool network.
Whenever a node operator deposits ether into Rocket Pool, they create a minipool.
This minipool contains the node operator's ether, and accepts another 16 ETH of user deposits.
As users deposit into Rocket Pool, their deposits move through a queue until they are randomly assigned to one or more minipools.
Users are also matched based on how long they agree to stake for, as everyone needs to withdraw together.

Minipools keep a strict record of all the funds deposited into them, and what has been withdrawn back out.
This includes the node operator's deposit, and the deposits of any users assigned to it.
This way, the minipool knows how much to give back to everyone once it has finished staking.
They also record a lot of other information about the node which created them, their staking status, and more.


***********************
The Active Minipool Set
***********************

*****************
Stalled Minipools
*****************
