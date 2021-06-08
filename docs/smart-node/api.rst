.. _smart-node-api:

#############
API Reference
#############


******************
The Smart Node API
******************

The Rocket Pool smart node service includes an API accessible via the ``api`` container.
API commands can be invoked via ``docker exec`` on the machine running the service::

    docker exec rocketpool_api /go/bin/rocketpool api [command] [subcommand] [args...]

The API is consumed by the smart node client, which offers a CLI interface for all provided functionality.
API endpoints are provided for extension by applications wishing to interact with a running smart node.

All arguments for ETH or token amounts are given in wei.
All endpoints return data in JSON format, always including ``status`` and ``error`` properties.


.. _smart-node-api-wallet:

***************
Wallet Commands
***************

* ``wallet status``: Get the current status of the password & wallet
* ``wallet set-password [password]``: Set the node password to the specified string
* ``wallet init``: Initialize the node wallet
* ``wallet recover [mnemonic]``: Recover the node wallet from a mnemonic phrase (must be quoted)
* ``wallet rebuild``: Rebuild validator keystores from derived keys
* ``wallet export``: Get the node password & wallet file contents


.. _smart-node-api-node:

*************
Node Commands
*************

* ``node status``: Get the current status of the node
* ``node can-register``: Check whether the node can be registered with Rocket Pool
* ``node register [timezone-location]``: Register the node with Rocket Pool
* ``node set-withdrawal-address [address]``: Set the node's withdrawal address
* ``node set-timezone [timezone-location]``: Set the node's timezone location
* ``node can-swap-rpl [amount]``: Check whether the node can swap an amount of old RPL for new RPL
* ``node swap-rpl [amount]``: Swap an amount of old RPL for new RPL
* ``node can-stake-rpl [amount]``: Check whether the node can stake an amount of RPL
* ``node stake-rpl [amount]``: Stake an amount of RPL
* ``node can-withdraw-rpl [amount]``: Check whether the node can withdraw an amount of staked RPL
* ``node withdraw-rpl [amount]``: Withdraw an amount of staked RPL
* ``node can-deposit [amount]``: Check whether the node can deposit the specified amount of ETH
* ``node deposit [amount] [min-fee]``: Deposit the specified amount of ETH with a minimum commission rate
* ``node can-send [amount] [token]``: Check whether the node can send an amount of tokens
* ``node send [amount] [token] [to-address]``: Send the specified amount of tokens to an address
* ``node can-burn [amount] [token]``: Check whether the node can burn an amount of tokens
* ``node burn [amount] [token]``: Burn the specified amount of tokens for ETH


.. _smart-node-api-minipool:

*****************
Minipool Commands
*****************

* ``minipool status``: Get the current status of all minipools owned by the node
* ``minipool can-refund [minipool-address]``: Check whether the specified minipool has a refund available
* ``minipool refund [minipool-address]``: Refund ETH from the specified minipool
* ``minipool can-dissolve [minipool-address]``: Check whether the specified minipool can be dissolved
* ``minipool dissolve [minipool-address]``: Dissolve the specified minipool
* ``minipool can-exit [minipool-address]``: Check whether the specified minipool can be exited from the beacon chain
* ``minipool exit [minipool-address]``: Exit the specified minipool from the beacon chain
* ``minipool can-withdraw [minipool-address]``: Check whether the specified minipool can be withdrawn from
* ``minipool withdraw [minipool-address]``: Withdraw deposit & rewards from the specified minipool
* ``minipool can-close [minipool-address]``: Check whether the specified minipool can be closed
* ``minipool close [minipool-address]``: Close the specified minipool


.. _smart-node-api-auction:

****************
Auction Commands
****************

* ``rocketpool auction status``: Get the current status of the RPL auction contract and lots
* ``rocketpool auction lots``: Get the details of all RPL lots
* ``rocketpool auction can-create-lot``: Check whether the node can create a new lot
* ``rocketpool auction create-lot``: Create a new RPL lot from RPL in the auction contract
* ``rocketpool auction can-bid-lot [lot-id]``: Check whether the node can bid on a lot
* ``rocketpool auction bid-lot [lot-id] [amount]``: Bid an amount of ETH on an active RPL lot
* ``rocketpool auction can-claim-lot [lot-id]``: Check whether the node can claim RPL from a lot
* ``rocketpool auction claim-lot [lot-id]``: Clean RPL from a cleared lot you bid on
* ``rocketpool auction can-recover-lot [lot-id]``: Check whether the node can recover unclaimed RPL from a lot
* ``rocketpool auction recover-lot [lot-id]``: Recover unclaimed RPL from a cleared lot back to the auction contract


.. _smart-node-api-oracle-dao:

*******************
Oracle DAO Commands
*******************

* ``rocketpool odao status``: Get the current status of the oracle DAO
* ``rocketpool odao members``: Get the details of all oracle DAO members
* ``rocketpool odao proposals``: Get the details of all oracle DAO proposals
* ``rocketpool odao can-propose-invite [address]``: Check whether the node can invite a member to join the oracle DAO
* ``rocketpool odao propose-invite [address] [id] [url]``: Invite a member to join the oracle DAO
* ``rocketpool odao can-propose-leave``: Check whether the node can propose leaving the oracle DAO
* ``rocketpool odao propose-leave``: Propose leaving the oracle DAO
* ``rocketpool odao can-propose-replace [address]``: Check whether the node can propose replacing its position in the oracle DAO
* ``rocketpool odao propose-replace [address] [id] [url]``: Propose replacing your position in the oracle DAO with a new member
* ``rocketpool odao can-propose-kick [address] [fine-amount]``: Check whether the node can propose kicking a member from the oracle DAO
* ``rocketpool odao propose-kick [address] [fine-amount]``: Propose kicking a member from the oracle DAO
* ``rocketpool odao can-cancel-proposal [proposal-id]``: Check whether the node can cancel a created proposal
* ``rocketpool odao cancel-proposal [proposal-id]``: Cancel a proposal you created
* ``rocketpool odao can-vote-proposal [proposal-id]``: Check whether the node can vote on a proposal
* ``rocketpool odao vote-proposal [proposal-id] [support]``: Vote on a proposal
* ``rocketpool odao can-execute-proposal [proposal-id]``: Check whether the node can execute a proposal
* ``rocketpool odao execute-proposal [proposal-id]``: Execute a passed proposal
* ``rocketpool odao can-join``: Check whether the node can join the oracle DAO
* ``rocketpool odao join``: Join the oracle DAO (requires an executed invite proposal)
* ``rocketpool odao can-leave``: Check whether the node can leave the oracle DAO
* ``rocketpool odao leave [bond-refund-address]``: Leave the oracle DAO (requires an executed leave proposal)
* ``rocketpool odao can-replace``: Check whether the node can replace its position in the oracle DAO
* ``rocketpool odao replace``: Replace your position in the oracle DAO (requires an executed replace proposal)


.. _smart-node-api-network:

****************
Network Commands
****************

* ``network node-fee``: Get the current network node commission rate
* ``network rpl-price``: Get the current network RPL price information


.. _smart-node-api-deposit-queue:

**********************
Deposit Queue Commands
**********************

* ``queue status``: Get the current status of the deposit pool and minipool queue
* ``queue can-process``: Check whether the deposit pool can be processed
* ``queue process``: Process the deposit pool
