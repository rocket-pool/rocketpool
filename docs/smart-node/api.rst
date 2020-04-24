#############
API Reference
#############


******************
The Smart Node API
******************

The Rocket Pool Smart Node stack includes an API accessible via the ``cli`` container.
All API commands begin with ``rocketpool api ...``.
API commands are largely analogous to the regular CLI commands, with some exceptions:

    * The API returns data in JSON format
    * The API does not have prompts which read input from the terminal
    * CLI commands which require user input are broken down into separate steps in the API
    * The API includes some extra commands which check the node state to determine whether actions can be taken


*************
Node Commands
*************

    * ``rocketpool api node status``: Return the node's status and balances
    * ``rocketpool api node account``: Return the node's ethereum account address
    * ``rocketpool api node canInitPassword``: Check whether the node password can be initialized
    * ``rocketpool api node initPassword [password]``: Initialize the node password
    * ``rocketpool api node canInitAccount``: Check whether the node account can be initialized
    * ``rocketpool api node initAccount``: Initialize the node account
    * ``rocketpool api node export``: Return the node password and account information
    * ``rocketpool api node canRegister``: Check whether the node can be registered with Rocket Pool
    * ``rocketpool api node register [timezone]``: Register the node with Rocket Pool
    * ``rocketpool api node withdraw [amount] [unit]``: Withdraw the specified amount of ETH or RPL from the node contract
    * ``rocketpool api node send [address] [amount] [unit]``: Send the specified amount of ETH, rETH or RPL from the node account to the specified address
    * ``rocketpool api node timezone [timezone]``: Change the timezone location the node is registered under


*****************
Node Fee Commands
*****************

    * ``rocketpool api fee get``: Return the current network user fee and the target user fee to vote for
    * ``rocketpool api fee set [percent]``: Set the target user fee percentage to vote for


****************
Deposit Commands
****************

    * ``rocketpool api deposit required``: Return the current network RPL requirements and utilization stats
    * ``rocketpool api deposit status``: Return the current node deposit status
    * ``rocketpool api deposit canReserve [duration]``: Check whether a deposit reservation can be made under the specified staking duration
    * ``rocketpool api deposit reserve [duration]``: Reserve a deposit under the specified staking duration
    * ``rocketpool api deposit canComplete``: Check whether an existing deposit reservation can be completed
    * ``rocketpool api deposit complete``: Complete an existing deposit reservation
    * ``rocketpool api deposit canCancel``: Check whether an existing deposit reservation can be cancelled
    * ``rocketpool api deposit cancel``: Cancel an existing deposit reservation


*****************
Minipool Commands
*****************

    * ``rocketpool api minipool status``: Return the statuses of all minipools owned by the node
    * ``rocketpool api minipool canWithdraw [address]``: Check whether the specified minipool can be withdrawn from
    * ``rocketpool api minipool withdraw [address]``: Withdraw ETH or rETH and RPL from the specified minipool


**********************
Deposit Queue Commands
**********************

    * ``rocketpool api queue status``: Return the status of all deposit queues
    * ``rocketpool api queue canProcess [duration]``: Check whether the specified deposit queue can be processed
    * ``rocketpool api queue process [duration]``: Process the specified deposit queue


***********************
Token Exchange Commands
***********************

    * ``rocketpool api exchange liquidity [token]``: Check the available liquidity of a token on Uniswap
    * ``rocketpool api exchange price [amount] [token]``: Check the current price for an amount of a token on Uniswap
    * ``rocketpool api exchange buy [ethAmount] [tokenAmount] [token]``: Purchase tokens on Uniswap at a maximum ETH price


*************
Misc Commands
*************

    * ``rocketpool api storage [dataType] [key]``: Retrieve a value from the RocketStorage contract.

    Valid data types are ``address``, ``bool``, ``bytes``, ``bytes32``, ``int``, ``string`` and ``uint``.
    The key is a hex-encoded keccak hash with the ``0x`` prefix.

