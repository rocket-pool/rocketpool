#######
Staking
#######


********
Overview
********

Staking is not unique to Rocket Pool, it's a feature coming to `Ethereum 2.0 <https://docs.ethhub.io/ethereum-roadmap/ethereum-2.0/proof-of-stake/>`_ in the near future.
Ethereum 2.0 will include a new chain called the Beacon Chain, which anyone can become a validator on by making a deposit (or "stake") of ether.
Validators are responsible for ensuring the integrity of the Ethereum network, and earn interest on their deposit by doing so.

The Beacon Chain will require a large sum of ether in order to become a validator, which many may not have access to.
Rocket Pool aims to solve this problem by combining small amounts of ether from multiple users so that they can stake together!


*****************
Staking Durations
*****************

Rocket Pool provides a few different staking duration options to node operators and users.
Whenever someone makes a deposit into Rocket Pool, they specify the duration that they want to stake for.
Each staking duration has its own deposit queue, and deposits are only matched to other deposits with the same duration.
This ensures that everyone who gets pooled together is on the same page regarding when they want to withdraw from the Beacon Chain and claim their rewards.
