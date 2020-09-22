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
* ``wallet export``: Get the node password & wallet file contents


.. _smart-node-api-node:

*************
Node Commands
*************

* ``node status``: Get the current status of the node
* ``node can-register``: Check whether the node can be registered with Rocket Pool
* ``node register [timezone-location]``: Register the node with Rocket Pool
* ``node set-timezone [timezone-location]``: Set the node's timezone location
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


.. _smart-node-api-misc:

**********************
Miscellaneous Commands
**********************

* ``network node-fee``: Get the current network node commission rate
* ``queue status``: Get the current status of the deposit pool and minipool queue
* ``queue can-process``: Check whether the deposit pool can be processed
* ``queue process``: Process the deposit pool
* ``faucet withdraw [token]``: Withdraw ETH or tokens from the Rocket Pool faucet (beta only)
