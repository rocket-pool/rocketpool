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

Rocket Pool maintains an "active minipool set", consisting of four minipools chosen pseudo-randomly from all available nodes.
This number is chosen to strike the right balance between dispersing risk (by splitting deposits up between minipools), and getting deposits staking quickly.
If the active minipool set size was too small, deposits wouldn't be split up between enough minipools.
If it was too large, it would take a long time for all minipools in the active set to fill up and begin staking.

Whenever the deposit queue is processed, deposits at the start of the queue are split up into 4 ETH chunks and assigned to minipools in the active set, in rotation.
Once all minipools have filled up and begun staking, a new active set is chosen.
If only one node has minipools available for assignment, it's possible that the active minipool set will only consist of a single pool.


*****************
Stalled Minipools
*****************

If a minipool is assigned some user deposits but fails to begin staking for a long time (i.e. if no new deposits are made), it will be marked as stalled.
When a minipool stalls, the node operator and users who deposited to it can all refund their ether and RPL.
No fees are charged in this case, since the network failed to provide a reliable staking service.
