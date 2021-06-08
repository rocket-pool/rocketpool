.. _smart-node-reference:

#################
Command Reference
#################


.. _smart-node-reference-service:

****************
Service Commands
****************

* ``rocketpool service install``: Install the Rocket Pool service either locally or to a remote server
* ``rocketpool service config``: Configure the Rocket Pool service and select Eth 1.0 and Eth 2.0 clients
* ``rocketpool service status``: Display the current status of the Rocket Pool service
* ``rocketpool service start``: Start the Rocket Pool service to begin running a smart node
* ``rocketpool service pause``: Pause the Rocket Pool service temporarily
* ``rocketpool service stop``: Pause the Rocket Pool service temporarily
* ``rocketpool service terminate``: Terminate the Rocket Pool service and remove all associated docker containers & volumes
* ``rocketpool service logs [services...]``: View the logs for one or more services running as part of the docker stack
* ``rocketpool service stats``: Display resource usage statistics for the Rocket Pool service
* ``rocketpool service version``: Display version information for the Rocket Pool client & service


.. _smart-node-reference-wallet:

***************
Wallet Commands
***************

* ``rocketpool wallet status``: Display the current status of the node's wallet
* ``rocketpool wallet init``: Initialize the node's password and wallet
* ``rocketpool wallet recover``: Recover a node wallet from a mnemonic phrase
* ``rocketpool wallet rebuild``: Rebuild validator keystores from derived keys
* ``rocketpool wallet export``: Display the node password and wallet file contents


.. _smart-node-reference-node:

*************
Node Commands
*************

* ``rocketpool node status``: Display the current status of the node
* ``rocketpool node register``: Register the node with the Rocket Pool network
* ``rocketpool node set-withdrawal-address [address]``: Set the address which node rewards & refunds are sent to
* ``rocketpool node set-timezone``: Update the node's timezone location
* ``rocketpool node swap-rpl``: Swap old RPL tokens for new RPL
* ``rocketpool node stake-rpl``: Stake RPL against the node to collateralize minipools
* ``rocketpool node withdraw-rpl``: Withdraw RPL staked against the node
* ``rocketpool node deposit``: Make a deposit to create a minipool and begin staking
* ``rocketpool node send [amount] [token] [to]``: Send an amount of ETH or tokens to an address
* ``rocketpool node burn [amount] [token]``: Burn reward tokens for ETH


.. _smart-node-reference-minipool:

*****************
Minipool Commands
*****************

* ``rocketpool minipool status``: Display the current status of all minipools run by the node
* ``rocketpool minipool refund``: Refund ETH from minipools which have had user-deposited ETH assigned to them
* ``rocketpool minipool dissolve``: Dissolve initialized minipools and recover deposited ETH from them
* ``rocketpool minipool exit``: Exit active minipool validators from the beacon chain
* ``rocketpool minipool withdraw``: Withdraw rewards from minipools which have finished staking and close them
* ``rocketpool minipool close``: Close minipools which have timed out and been dissolved


.. _smart-node-reference-auction:

****************
Auction Commands
****************

* ``rocketpool auction status``: Display the current status of the RPL auction contract and lots
* ``rocketpool auction lots``: Display the details of all RPL lots
* ``rocketpool auction create-lot``: Create a new RPL lot from RPL in the auction contract
* ``rocketpool auction bid-lot``: Bid ETH on an active RPL lot
* ``rocketpool auction claim-lot``: Clean RPL from a cleared lot you bid on
* ``rocketpool auction recover-lot``: Recover unclaimed RPL from a cleared lot back to the auction contract


.. _smart-node-reference-oracle-dao:

*******************
Oracle DAO Commands
*******************

* ``rocketpool odao status``: Display the current status of the oracle DAO
* ``rocketpool odao members``: Display the details of all oracle DAO members
* ``rocketpool odao proposals``: Display the details of all oracle DAO proposals
* ``rocketpool odao propose-invite [address] [id] [url]``: Invite a member to join the oracle DAO
* ``rocketpool odao propose-leave``: Propose leaving the oracle DAO
* ``rocketpool odao propose-replace [address] [id] [url]``: Propose replacing your position in the oracle DAO with a new member
* ``rocketpool odao propose-kick``: Propose kicking a member from the oracle DAO
* ``rocketpool odao cancel-proposal``: Cancel a proposal you created
* ``rocketpool odao vote-proposal``: Vote on a proposal
* ``rocketpool odao execute-proposal``: Execute a passed proposal
* ``rocketpool odao join``: Join the oracle DAO (requires an executed invite proposal)
* ``rocketpool odao leave``: Leave the oracle DAO (requires an executed leave proposal)
* ``rocketpool odao replace``: Replace your position in the oracle DAO (requires an executed replace proposal)


.. _smart-node-reference-network:

****************
Network Commands
****************

* ``rocketpool network node-fee``: Display the current network node commission rate for new minipools
* ``rocketpool network rpl-price``: Display the current network RPL price information


.. _smart-node-reference-deposit-queue:

**********************
Deposit Queue Commands
**********************

* ``rocketpool queue status``: Display the current status of the deposit pool
* ``rocketpool queue process``: Process the deposit pool by assigning user-deposited ETH to available minipools
