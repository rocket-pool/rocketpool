.. _smart-node-non-docker:

##############################################
Running the Rocket Pool Service Outside Docker
##############################################

Users with advanced setups may wish to run the Rocket Pool service on their host OS, outside of a Docker environment.
Note that when using this method, users must install and manage their own Eth 1.0 and Eth 2.0 beacon & validator clients.
The Rocket Pool service daemons must also be manually registered with the OS service manager (e.g. systemd).

The following commands are unavailable when running the Rocket Pool service outside of Docker:

    * ``rocketpool service status``
    * ``rocketpool service start``
    * ``rocketpool service pause``
    * ``rocketpool service stop``
    * ``rocketpool service terminate``
    * ``rocketpool service logs``
    * ``rocketpool service stats``

To run the Rocket Pool service on your host OS, follow these steps:

#. `Install Go <https://golang.org/doc/install>`_

#. Clone the Rocket Pool smartnode repository and checkout the tag for the desired version::

    git clone https://github.com/rocket-pool/smartnode.git
    cd smartnode
    git checkout vX.X.X

#. Build the Rocket Pool CLI client from source and install it::

    cd rocketpool-cli
    go build rocketpool-cli.go
    mv rocketpool-cli /usr/local/bin/rocketpool

#. Build the Rocket Pool service daemon from source and install it::

    cd ../rocketpool
    go build rocketpool.go
    mv rocketpool /usr/local/bin/rocketpoold

#. Install the smart node service files for the desired version, skipping OS dependency (Docker) installation::

    rocketpool service install -v X.X.X -d

#. Optionally, delete the following unused files (for Docker setups only):

    * ``~/.rocketpool/docker-compose.yml``
    * ``~/.rocketpool/chains/*``

#. Make the following modifications to your Rocket Pool config file (``~/.rocketpool/config.yml``):

    * Update ``smartnode.passwordPath`` to e.g. ``/home/[USERNAME]/.rocketpool/data/password``
    * Update ``smartnode.walletPath`` to e.g. ``/home/[USERNAME]/.rocketpool/data/wallet``
    * Update ``smartnode.validatorKeychainPath`` to e.g. ``/home/[USERNAME]/.rocketpool/data/validators``
    * Update ``chains.eth1.provider`` to e.g. ``http://127.0.0.1:8545``
    * Update ``chains.eth2.provider`` to e.g. ``127.0.0.1:5052`` (if using Prysm, use the port for gRPC)

#. Configure the Rocket Pool service, selecting Geth for your Eth 1.0 client, and the appropriate Eth 2.0 client::

    rocketpool service config

#. Register the following services with your operating system (example systemd units are provided below):

    * Geth
    * Lighthouse / Prysm beacon chain
    * Lighthouse / Prysm validator
    * ``/usr/local/bin/rocketpoold node``
    * ``/usr/local/bin/rocketpoold watchtower``

#. Add the following alias to your ``.profile`` (or ``.bash_profile`` / ``.zprofile`` as appropriate) and start a new shell session:

    * ``alias rp="rocketpool -d /usr/local/bin/rocketpoold"``

#. Use the alias ``rp`` to interact with the Rocket Pool service, e.g.: ``rp node status``


.. _smart-node-non-docker-systemd:

**********************************************
Example systemd Units for Rocket Pool Services
**********************************************

Geth::

    [Unit]
    Description=Geth
    After=network.target

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/path/to/geth --goerli --http --http.addr 127.0.0.1 --http.port 8545 --http.api eth,net,personal,web3 --http.vhosts *

    [Install]
    WantedBy=multi-user.target

Lighthouse - Beacon Chain::

    [Unit]
    Description=Lighthouse Beacon
    After=geth.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/path/to/lighthouse beacon --testnet medalla --eth1 --eth1-endpoint http://127.0.0.1:8545 --http --http-address 127.0.0.1 --http-port 5052

    [Install]
    WantedBy=multi-user.target

Lighthouse - Validator::

    [Unit]
    Description=Lighthouse Validator
    After=lighthouse-beacon.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/path/to/lighthouse validator --testnet medalla --datadir /home/[USERNAME]/.rocketpool/data/validators/lighthouse --init-slashing-protection --delete-lockfiles --beacon-node http://127.0.0.1:5052

    [Install]
    WantedBy=multi-user.target

Prysm - Beacon Chain::

    [Unit]
    Description=Prysm Beacon
    After=geth.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/path/to/prysm/beacon-chain --accept-terms-of-use --medalla --http-web3provider http://127.0.0.1:8545 --rpc-host 127.0.0.1 --rpc-port 5052

    [Install]
    WantedBy=multi-user.target

Prysm - Validator::

    [Unit]
    Description=Prysm Validator
    After=prysm-beacon.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/path/to/prysm/validator --accept-terms-of-use --medalla --wallet-dir /home/[USERNAME]/.rocketpool/data/validators/prysm-non-hd --wallet-password-file /home/[USERNAME]/.rocketpool/data/password --beacon-rpc-provider 127.0.0.1:5052

    [Install]
    WantedBy=multi-user.target

Rocket Pool Node Daemon::

    [Unit]
    Description=Rocketpool Node
    After=geth.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/usr/local/bin/rocketpoold --config /home/[USERNAME]/.rocketpool/config.yml --settings /home/[USERNAME]/.rocketpool/settings.yml node

    [Install]
    WantedBy=multi-user.target

Rocket Pool Watchtower Daemon::

    [Unit]
    Description=Rocketpool Watchtower
    After=geth.service

    [Service]
    Type=simple
    Restart=always
    RestartSec=5
    ExecStart=/usr/local/bin/rocketpoold --config /home/[USERNAME]/.rocketpool/config.yml --settings /home/[USERNAME]/.rocketpool/settings.yml watchtower

    [Install]
    WantedBy=multi-user.target
