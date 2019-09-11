#######################
The Rocket Pool Service
#######################


********************
Starting the Service
********************

Start the Rocket Pool service by running::

    rocketpool service start

This will "build up" the Smart Node stack, which runs it and also ensures that it stays running.
If any of the running containers crash or you restart your node, Docker will start them back up to ensure that no uptime is lost.

You can check that the containers are running correctly with::

    docker ps

You should see (in any order) entries for containers with ``IMAGE`` names similar to the following:

    * ``rocketpool/smartnode-cli:v0.0.1``
    * ``rocketpool/smartnode-node:v0.0.1``
    * ``rocketpool/smartnode-minipools:v0.0.1``
    * ``rocketpool/smartnode-watchtower:v0.0.1``
    * ``ethereum/client-go:stable``
    * ``traefik``


*******************
Pausing the Service
*******************

If you want to pause the Rocket Pool service for any reason, run::

    rocketpool service pause

This will stop all running containers, suspending their execution, but leave them intact.
Note that this will stop validators from performing their validation duties, so use this command with caution.
The service can be started up again with ``rocketpool service start``.


********************
Stopping the Service
********************

If you have finished interacting with the Rocket Pool network and want to stop the service entirely, run::

    rocketpool service stop

This will "tear down" the Smart Node stack, stopping and removing all running containers, and deleting their state.
Not only will validators stop performing validation duties, but all Ethereum clients will need to re-sync if the service is restarted.
It is advised to use this command only if the node has no minipools remaining and no balances to withdraw in its network contract.

As a security measure, node data at ``RP_PATH`` (including the node & validators' private keys) will be preserved, and must be manually deleted if desired (this is not recommended).


*************************
Reconfiguring the Service
*************************

If you want to make any configuration changes to the Rocket Pool service, run::

    rocketpool service config

This will repeat the configuration prompts that were run on installation, and will overwrite your node's Docker configuration file accordingly.
For the changes to take effect, restart the Rocket Pool service with ``rocketpool service start``.


*******************
Scaling the Service
*******************

This feature creates additional containers for an image, and is for advanced use only.
For example, to run 3 Ethereum PoW client containers in parallel, run::

    rocketpool service scale pow=3

RPC requests from other containers will be load-balanced between the available PoW client containers.


***************************
Viewing Service Information
***************************

You can view the logs for all running containers in real-time with::

    rocketpool service logs

To view the logs for a single container, add its name at the end, e.g.::

    rocketpool service logs pow

Press Ctrl-C to stop.

You can also view the hardware usage for each container with::

    rocketpool service stats

Press Ctrl-C to stop.
