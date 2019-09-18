######
Groups
######


********
Overview
********

All user deposits into the Rocket Pool network are made through a group.
An organisation can register as a group with Rocket Pool, allowing them to move funds into the network for staking.
This effectively allows them to use Rocket Pool as staking infrastructure, using their own deposit processes and application front-ends.
Rocket Pool employs an `"eat your own dog food" <https://en.wikipedia.org/wiki/Eating_your_own_dog_food>`_ approach, using its own registered group for processing user interactions.


********************************
Group Depositors and Withdrawers
********************************

Groups register Depositor and Withdrawer contracts which their users can use to deposit ether into Rocket Pool, and withdraw their rewards as rETH.
A group can have any number of each, allowing them to funnel user interactions from various sources with custom behaviour.
Rocket Pool supplies default contracts if a group doesn't require any custom deposit and withdrawal processes.
