######
Tokens
######


********
Overview
********

The ``tokens`` module manages the various Rocket Pool tokens, and is broken down into two submodules:

    * ``tokens.reth``: Manages rETH token interactions
    * ``tokens.rpl``: Manages RPL token interactions

Each submodule has the same interface for interacting with its underlying ERC-20 token.
Mutator methods are restricted to their respective accounts.


*******
Methods
*******

    * ``tokens.[token].balanceOf(account)``:
      Get the token balance of the specified account (address); returns ``Promise<string>``

    * ``tokens.[token].allowance(account, spender)``:
      Get the allowance of the specified account, for the specified spender (addresses); returns ``Promise<string>``

    * ``tokens.[token].transfer(to, amount, options, onConfirmation)``:
      Transfer the specified amount of tokens in wei (string) to the 'to' address; returns ``Promise<TransactionReceipt>``

    * ``tokens.[token].approve(spender, amount, options, onConfirmation)``:
      Approve an allowance of the specified amount in wei (string) for the specified spender (address); returns ``Promise<TransactionReceipt>``

    * ``tokens.[token].transferFrom(from, to, amount, options, onConfirmation)``:
      Transfer the specified amount of tokens in wei (string) from the 'from' address to the 'to' address; returns ``Promise<TransactionReceipt>``
