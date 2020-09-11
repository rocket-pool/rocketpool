.. _js-library-tokens:

######
Tokens
######


********
Overview
********

The ``tokens`` module manages the various Rocket Pool tokens, and is broken down into two submodules:

    * ``tokens.neth``: Manages rETH token interactions
    * ``tokens.reth``: Manages rETH token interactions

Each submodule shares common methods for interacting with its underlying ERC-20 token.
Mutator methods are restricted to their respective accounts.


.. _js-library-tokens-methods:

*******
Methods
*******

**All Tokens**:

    * ``tokens.[token].balanceOf(account)``:
      Get the token balance of the specified account (address) in wei; returns ``Promise<string>``

    * ``tokens.[token].allowance(account, spender)``:
      Get the allowance of the specified account, for the specified spender (addresses) in wei; returns ``Promise<string>``

    * ``tokens.[token].transfer(to, amount, options, onConfirmation)``:
      Transfer the specified amount of tokens in wei to the 'to' address; returns ``Promise<TransactionReceipt>``

    * ``tokens.[token].approve(spender, amount, options, onConfirmation)``:
      Approve an allowance of the specified amount in wei for the specified spender (address); returns ``Promise<TransactionReceipt>``

    * ``tokens.[token].transferFrom(from, to, amount, options, onConfirmation)``:
      Transfer the specified amount of tokens in wei from the 'from' address to the 'to' address; returns ``Promise<TransactionReceipt>``

**nETH Token**:

    * ``tokens.neth.burn(amount, options, onConfirmation)``:
      Burn the specified amount of nETH in wei for ETH; returns ``Promise<TransactionReceipt>``

**rETH Token**:

    * ``tokens.reth.getEthValue(rethAmount)``:
      Get the amount of ETH in wei backing an amount of rETH in wei; returns ``Promise<string>``

    * ``tokens.reth.getRethValue(ethAmount)``:
      Get the amount of rETH in wei backed by an amount of ETH in wei; returns ``Promise<string>``

    * ``tokens.reth.getExchangeRate()``:
      Get the amount of ETH backing 1 rETH; returns ``Promise<number>``

    * ``tokens.reth.getTotalCollateral()``:
      Get the total amount of ETH collateral available for exchage in wei; returns ``Promise<string>``

    * ``tokens.reth.getCollateralRate()``:
      Get the proportion of rETH backed by ETH collateral in the contract as a fraction of 1; returns ``Promise<number>``

    * ``tokens.reth.burn(amount, options, onConfirmation)``:
      Burn the specified amount of rETH in wei for ETH; returns ``Promise<TransactionReceipt>``
