## Top level idea

- Consistency makes our queue easier to work with
  - For example, queue_capacity is currently just queue_length*16 for the half deposit queue
  - For example, we need to know the capacity of the next minipool in the queue to decide whether we
    have enough ETH to assign it
- We can maintain consistency by implementing the "use eth in the queue" idea
  - For this idea, we make the minimum deposit on the beacon chain (1 ETH), and _every_ minipool
    will need 31 ETH to launch. This will be true with 16 or 8 ETH node deposits for now, and for
    whatever future values we support.
  - If we _don't_ maintain consistency like this, finding capacity requires either iterating through
    the queue, or adding an extra tracking variable that we update on pop.
- In my "[wip] Deposit side" commit, I've used nodeDepositAssigned=False, and a positive
  nodeDepositBalance to indicate this state where I've provided some ETH (eg, 16), but it's not all
  in the minipool contract.

To add LEB8s, we'd need to tweak getDepositType to allow 8 ETH deposits.