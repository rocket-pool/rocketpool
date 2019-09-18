####################
Rocket Pool Concepts
####################


*******
Staking
*******

Staking is not unique to Rocket Pool, it's a feature coming to `Ethereum 2.0 <https://docs.ethhub.io/ethereum-roadmap/ethereum-2.0/proof-of-stake/>`_ in the near future.
Ethereum 2.0 will include a new chain called the Beacon Chain, which anyone can become a validator on by making a deposit (or "stake") of ether.
Validators are responsible for ensuring the integrity of the Ethereum network, and earn interest on their deposit by doing so.

The Beacon Chain will require a large sum of ether in order to become a validator, which many may not have access to.
Rocket Pool aims to solve this problem by combining small amounts of ether from multiple users so that they can stake together!


******
Groups
******

All user deposits into the Rocket Pool network are made through a group.
An organisation can register as a group with Rocket Pool, allowing them to move funds into the network for staking.
This effectively allows them to use Rocket Pool as staking infrastructure, using their own deposit processes and application front-ends.
Rocket Pool employs an `"eat your own dog food" <https://en.wikipedia.org/wiki/Eating_your_own_dog_food>`_ approach, using its own registered group for processing user interactions.

Groups register Depositor and Withdrawer contracts which their users can use to deposit ether into Rocket Pool, and withdraw their rewards as rETH.
A group can have any number of each, allowing them to funnel user interactions from various sources with custom behaviour.
Rocket Pool supplies default contracts if a group doesn't require any custom deposit and withdrawal processes.


*****
Nodes
*****

Nodes are the workhorses of the Rocket Pool network.
Anyone can register as a node with Rocket Pool, and begin staking.
When a node operator wants to stake, they deposit 16 ETH into Rocket Pool, which is matched with 16 ETH of user deposits.
The node performs all of the validation duties required by the Ethereum network, and earns a percentage of the users' rewards as compensation.

Nodes constantly check in with the network to indicate that they are doing their job.
If a node fails to check in for a long time, it will be deactivated by other nodes.
This won't prevent it from validating (in case it still is), but will stop users from being assigned to any new minipools it creates.


*********
Minipools
*********

Minipools are the matchmaking service at the heart of the Rocket Pool network.
Whenever a node operator deposits ether into Rocket Pool, they create a minipool.
This minipool contains the node operator's ether, and accepts another 16 ETH of user deposits.
As users deposit into Rocket Pool, their deposits move through a queue until they are randomly assigned to one or more minipools.
Users are also matched based on how long they agree to stake for, as everyone needs to withdraw together.

Minipools keep a strict record of all the funds deposited into them, and what has been withdrawn back out.
This includes the node operator's deposit, and the deposits of any users assigned to it.
This way, the minipool knows how much to give back to everyone once it has finished staking.
They also record a lot of other information about the node which created them, their staking status, and more.
