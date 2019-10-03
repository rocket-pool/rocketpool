#####################################
Node Setup, Registration & Management
#####################################


**********************
Initializing Your Node
**********************

With the Rocket Pool service running, the first thing you'll need to do is initialize your node password & account::

    rocketpool node init

This will prompt you to enter a node password, and will then save it to disk along with a newly generated private key for your node account.
You won't need to enter your node password again, it will simply be used by the Smart Node to unlock your account.

Your node password is stored at ``~/.rocketpool/password``, while your private key is stored under ``~/.rocketpool/accounts/``.
Feel free to back these up in a safe and secure storage area which can't be accessed by anyone else.

You can make sure your account was created successfully with::

    rocketpool node status

This should display something like: ``Node account 0x0123...0123 has a balance of 00.00 ETH, 00.00 rETH and 00.00 RPL``.


*************************
Seeding Your Node Account
*************************

Next, you'll need to load your node account up with ETH and RPL to deposit into Rocket Pool.
You'll also need at least 1 ETH in order to register with Rocket Pool.
This isn't paid to Rocket Pool - we simply ensure that node operators have enough to cover their gas costs.

Special commands are available to withdraw ETH and RPL from faucets to your node account, for the Rocket Pool beta only.
You can check your current faucet allowances with::

	rocketpool faucet allowance

Then, withdraw resources with::

	rocketpool faucet withdraw [amount] [unit]

where ``[amount]`` and ``[unit]`` specify how much of which resource ("ETH" or "RPL") to withdraw.
Note that it may take a couple of minutes for tokens to be minted to your node account; you can check its balances again with::

	rocketpool node status


*********************
Registering Your Node
*********************

Once you're ready, register with::

    rocketpool node register

You will be prompted to either detect your timezone location automatically, or enter it manually.
This information is not used for KYC purposes, but is sent to Rocket Pool during registration in order to display accurate node information to users.
You may abstain by manually entering a location such as ``Hidden/Hidden``.

Once you've registered successfully, you can check your status again::

    rocketpool node status

This should now display additional information like: ``Node registered with Rocket Pool with contract at 0xcdef...cdef,``
``timezone 'Etc/Etc' and a balance of 2.00 ETH and 0.00 RPL``

Registering your node will create a new node contract which is used to interact with the Rocket Pool network.
Some operations (such as depositing to Rocket Pool or withdrawing from minipools which have finished staking) will affect the ETH and token balances of this contract.
The node contract is linked directly to your node account, restricting access of these operations to you.


**************************
Updating Your Registration
**************************

If you want to update the timezone your node is registered in, run::

    rocketpool node timezone

This will repeat the prompts run during registration, and update your node's information in the network.


***********************************
Withdrawing From Your Node Contract
***********************************

If one of your node's minipools stalls (expires after a long period of inactivity) or withdraws from staking, its ETH & RPL balances will be sent to your node contract.
You can simply leave these to be used for future deposits, or to withdraw them to your account, use::

    rocketpool node withdraw [amount] [unit]

where ``[amount]`` and ``[unit]`` specify how much of which resource ("ETH" or "RPL") to withdraw.


******************************
Sending From Your Node Account
******************************

If you want to send ETH or tokens from your node account to another Ethereum address at any time, use::

	rocketpool node send [address] [amount] [unit]

This will send the specified amount of ETH, rETH or RPL from the node account to the specified address.
