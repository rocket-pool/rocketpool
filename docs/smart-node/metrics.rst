#######
Metrics
#######


******************
Smart Node Metrics
******************

The Rocket Pool Smart Node stack exposes metrics via a HTTP server running within the ``metrics`` container, on port ``2112`` at ``/metrics``.
Metrics data is consumed by prometheus, and includes information on the Eth 1.0 and Eth 2.0 nodes, as well as the smart node itself.


***************
Eth 1.0 Metrics
***************

    * ``smartnode_eth1_block_number``: The current Eth 1.0 block number
    * ``smartnode_eth1_syncing``: Whether the Eth 1.0 node is syncing (1) nor not (0)
    * ``smartnode_eth1_sync_starting_block``: The block number the node started syncing at (0 if not syncing)
    * ``smartnode_eth1_sync_current_block``: The current block number the node is synced to (0 if not syncing)
    * ``smartnode_eth1_sync_highest_block``: The highest block number the node will sync to (0 if not syncing)


***************
Eth 2.0 Metrics
***************

    * ``smartnode_eth2_epoch_number``: The current Eth 2.0 epoch number
    * ``smartnode_eth2_finalized_epoch``: The highest finalized Eth 2.0 epoch number
    * ``smartnode_eth2_justified_epoch``: The highest justified Eth 2.0 epoch number


*******************
Rocket Pool Metrics
*******************

    * ``smartnode_rocketpool_queue_max_size``: The maximum deposit queue size in ETH
    * ``smartnode_rocketpool_staking_enabled_[duration]``: Whether the staking duration is enabled (1) or not (0)
    * ``smartnode_rocketpool_network_eth_capacity_[duration]``: The total network deposit capacity for the staking duration in ETH
    * ``smartnode_rocketpool_network_eth_assigned_[duration]``: The total network deposits assigned to the staking duration in ETH
    * ``smartnode_rocketpool_network_utilisation_[duration]``: The network utilisation for the staking duration from 0 (0%) to 1 (100%)
    * ``smartnode_rocketpool_rpl_ratio_[duration]``: The current RPL:ETH ratio for the staking duration
    * ``smartnode_rocketpool_queue_balance_[duration]``: The current deposit queue balance for the staking duration
    * ``smartnode_rocketpool_minipool_total_count``: The total number of minipools in the Rocket Pool network
    * ``smartnode_rocketpool_minipool_[status]_count``: The total number of minipools in the Rocket Pool network by status
    * ``smartnode_rocketpool_node_total_count``: The total number of nodes in the Rocket Pool network
    * ``smartnode_rocketpool_node_active_count``: The total number of active nodes in the Rocket Pool network

