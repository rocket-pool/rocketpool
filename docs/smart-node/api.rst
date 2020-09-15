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

* ``status``: Get the current status of the password & wallet
* ``set-password [password]``: Set the node password to the specified string
* ``init``: Initialize the node wallet
* ``recover [mnemonic]``: Recover the node wallet from a mnemonic phrase (must be quoted)
* ``export``: Get the node password & wallet file contents


.. _smart-node-api-node:

*************
Node Commands
*************

* ``status``: Get the current status of the node
* ``can-register``: Check whether the node can be registered with Rocket Pool
* ``register [timezone-location]``: Register the node with Rocket Pool
* ``set-timezone [timezone-location]``: Set the node's timezone location
* ``can-deposit [amount]``: Check whether the node can deposit the specified amount of ETH
* ``deposit [amount] [min-fee]``: Deposit the specified amount of ETH with a minimum commission rate
* ``can-send [amount] [token]``: Check whether the node can send an amount of tokens
* ``send [amount] [token] [to-address]``: Send the specified amount of tokens to an address
* ``can-burn [amount] [token]``: Check whether the node can burn an amount of tokens
* ``burn [amount] [token]``: Burn the specified amount of tokens for ETH


.. _smart-node-api-minipool:

*****************
Minipool Commands
*****************

* ``status``: Get the current status of all minipools owned by the node
* ``can-refund [minipool-address]``: Check whether the specified minipool has a refund available
* ``refund [minipool-address]``: Refund ETH from the specified minipool
* ``can-dissolve [minipool-address]``: Check whether the specified minipool can be dissolved
* ``dissolve [minipool-address]``: Dissolve the specified minipool
* ``can-exit [minipool-address]``: Check whether the specified minipool can be exited from the beacon chain
* ``exit [minipool-address]``: Exit the specified minipool from the beacon chain
* ``can-withdraw [minipool-address]``: Check whether the specified minipool can be withdrawn from
* ``withdraw [minipool-address]``: Withdraw deposit & rewards from the specified minipool
* ``can-close [minipool-address]``: Check whether the specified minipool can be closed
* ``close [minipool-address]``: Close the specified minipool


.. _smart-node-api-misc:

**********************
Miscellaneous Commands
**********************

* ``network node-fee``: Get the current network node commission rate
* ``queue status``: Get the current status of the deposit pool and minipool queue
* ``queue can-process``: Check whether the deposit pool can be processed
* ``queue process``: Process the deposit pool
