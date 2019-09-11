#################
Command Reference
#################


****************
Service Commands
****************

    * ``rocketpool service start``: Start the Smart Node containers
    * ``rocketpool service pause``: Stop the execution of the Smart Node containers
    * ``rocketpool service stop``: Stop the execution of and remove all Smart Node containers and their state
    * ``rocketpool service scale [service=NUM]``: Scale the number of containers for a Smart Node service
    * ``rocketpool service config``: Reconfigure the Smart Node service (requires restart for changes to take effect)
    * ``rocketpool service logs [services]``: View the logs for the Smart Node stack or for an individual container
    * ``rocketpool service stats``: View resource usage statistics for the Smart Node stack


*************
Node Commands
*************

    * ``rocketpool node status``: View the node's status and balances
    * ``rocketpool node init``: Initialise the node with a password and an account
    * ``rocketpool node register``: Register the node with Rocket Pool
    * ``rocketpool node withdraw [amount] [unit]``: Withdraw the specified amount of ETH or RPL from the node contract
    * ``rocketpool node timezone``: Change the timezone location the node is registered under


***************
Faucet Commands
***************

    * ``rocketpool faucet allowance``: Check your ETH and RPL faucet allowances
    * ``rocketpool faucet withdraw [amount] [unit]``: Withdraw the specified amount of ETH or RPL from the faucet to your node account


*****************
Node Fee Commands
*****************

    * ``rocketpool fee display``: Display the current network user fee and the target user fee to vote for
    * ``rocketpool fee set [percent]``: Set the target user fee percentage to vote for


****************
Deposit Commands
****************

    * ``rocketpool deposit required [duration]``: View the current RPL requirement for the specified staking duration
    * ``rocketpool deposit make [duration]``: Make a deposit for the specified staking duration


*****************
Minipool Commands
*****************

    * ``rocketpool minipool status``: Check the status of all minipools owned by the node
    * ``rocketpool minipool withdraw``: Withdraw ETH or rETH and RPL from withdrawn or stalled minipools
