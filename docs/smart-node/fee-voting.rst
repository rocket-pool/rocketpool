###############
Node Fee Voting
###############


***************************
Setting the Target User Fee
***************************

All nodes within the Rocket Pool network charge users the same fee, based on a percentage of staking rewards earned.
This fee changes dynamically based on votes from node operators in a similar fashion to how the Ethereum block gas limit is influenced by miners.

You can set your target user fee to vote for with::

    rocketpool fee set [percent]

During each voting cycle, if the current network user fee is less than or greater than your target fee, your node will vote to raise or lower it respectively.
Otherwise, it will vote to leave it as is.

Note that the network user fee only moves up or down by a small amount each voting cycle to prevent large swings or unpredictability.
The user fee is also "locked in" on each minipool when it begins staking, in the interest of fairness to both node operators and users.

You can view information about the current network user fee, and your target user fee, with::

    rocketpool fee display
