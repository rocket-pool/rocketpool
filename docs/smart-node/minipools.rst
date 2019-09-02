#####################################
Managing & Withdrawing From Minipools
#####################################


************************
Checking Minipool Status
************************

Once you have made one or more deposits from your node, you can view the status of your created minipools with::

    rocketpool minipool status

This will list the following properties of all minipools created by your node:

    * ``Address``: The minipool's address
    * ``Status``: The minipool's current state in its lifecycle, one of:

        * ``initialized``: The minipool has been created and has no user deposits assigned yet
        * ``pre-launch``: The minipool has user deposits assigned to it but not enough to begin staking
        * ``staking``: The minipool has filled with user deposits, sent its balance to the beacon chain, and begun staking
        * ``logged out``: The minipool has been logged out from the beacon chain but is not yet ready to withdraw from
        * ``withdrawn``: The minipool has withdrawn from the beacon chain and its rewards may now be withdrawn as rETH
        * ``timed out``: The minipool timed out after a period of inactivity and deposited ETH and RPL may be withdrawn from it

    * ``Status Updated Time``: The time at which the minipool reached its current state
    * ``Staking Duration``: The duration the minipool will stake for before logging out from the beacon chain
    * ``Node ETH Deposited``: The ETH balance of the deposit you made to the minipool from your node contract
    * ``Node RPL Deposited``: The RPL balance of the deposit you made to the minipool from your node contract
    * ``Deposit Count``: The number of user deposits assigned to the minipool
    * ``User Deposit Capacity``: The total amount of user deposits in ETH which the minipool can hold
    * ``User Deposit Total``: The total amount of user deposits in ETH which the minipool is currently holding


**************************
Withdrawing From Minipools
**************************

Once one or more of your node's minipools have finished staking, you can withdraw your rewards and RPL from them with::

    rocketpool minipool withdraw

This will list all of your minipools which are available for withdrawal and prompt you to select one (or all) of them to withdraw from.
Withdrawn rETH will be sent to your node account, while withdrawn RPL will be sent to the node contract to be re-used in your next deposit.
If you want to withdraw it to your node account too, run::

    rocketpool node withdraw [amount] rpl
