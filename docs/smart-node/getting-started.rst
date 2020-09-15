.. _smart-node-getting-started:

###############
Getting Started
###############


.. _smart-node-getting-started-requirements:

**************************
OS & Hardware Requirements
**************************

The smart node client is supported on Linux, MacOS and Windows.
**Note that a smart node cannot be run locally on Windows at this stage; the Windows client can only be used to manage a remote server.**

The smart node service is supported on all Unix platforms, with automatic OS dependency installation for Ubuntu, Debian, CentOS and Fedora.
**OS dependencies (`docker engine <https://docs.docker.com/engine/install/>`_ and `docker-compose <https://docs.docker.com/compose/install/>`_) must be installed manually on all other Unix platforms.**

Support for additional operating systems will be added incrementally, after successful testing of the existing version.

The Smart Node stack requires at least 4GB of memory and 8GB of (SSD) hard disk space in order to run.
Note that a node operator must have **root** access to their node in order to install and run the smart node service.


.. _smart-node-getting-started-installation:

************
Installation
************

Firstly, install the smart node client locally.
For Linux & MacOS, run either the cURL or wget command depending on which utilities are installed on your system.
You can check with ``curl --version`` and ``wget --version`` respectively.

**Linux (64 bit)**:

With cURL::
    curl -L https://github.com/rocket-pool/smartnode-install/releases/latest/download/rocketpool-cli-linux-amd64 --create-dirs -o ~/bin/rocketpool && chmod +x ~/bin/rocketpool

With wget::
    mkdir -p ~/bin && wget https://github.com/rocket-pool/smartnode-install/releases/latest/download/rocketpool-cli-linux-amd64 -O ~/bin/rocketpool && chmod +x ~/bin/rocketpool

**MacOS (64 bit)**:

With cURL::
    curl -L https://github.com/rocket-pool/smartnode-install/releases/latest/download/rocketpool-cli-darwin-amd64 -o /usr/local/bin/rocketpool && chmod +x /usr/local/bin/rocketpool

With wget::
    wget https://github.com/rocket-pool/smartnode-install/releases/latest/download/rocketpool-cli-darwin-amd64 -O /usr/local/bin/rocketpool && chmod +x /usr/local/bin/rocketpool

**Windows (64 bit)**:

#. Download the `smart node client <https://github.com/rocket-pool/smartnode-install/releases/latest/download/rocketpool-cli-windows-amd64.exe>`_.
#. Move it to the desired location on your system (e.g. ``C:\bin\rocketpool.exe``).
#. Open the command prompt and run it via its full path (e.g. ``C:\bin\rocketpool.exe``).

Secondly, install the smart node service either locally or on a remote server.
To install locally, simply run ``rocketpool service install``.
To install remotely, provide flags for the remote host address, username, and SSH identity file, e.g.::
    rocketpool --host example.com --user username --key /path/to/identity.pem service install

If automatic dependency installation is not supported on your platform (or if you would prefer to install OS dependencies yourself), use the ``-d`` option to skip this step (e.g. ``rocketpool service install -d``).
Then, manually install `docker engine <https://docs.docker.com/engine/install/>`_ and `docker-compose <https://docs.docker.com/compose/install/>`_.

The following installation options are available:

* ``-r``: Verbose mode (print all output from the installation process)
* ``-d``: Skip automatic installation of OS dependencies
* ``-n``: Specify a network to run the smart node on (default: medalla)
* ``-v``: Specify a version of the smart node service package files to use (default: latest)

Once the smart node service has been installed, you may need to start a new shell session if working locally.
This is required for updated user permissions (to interact with docker engine) to take effect.


.. _smart-node-getting-started-configuration:

*************
Configuration
*************

Once the smart node service is installed, it must be configured before use.
Simply run ``rocketpool config`` and follow the prompts to select which Eth 1.0 and Eth 2.0 clients to run in the smart node stack.

You may use `Infura <https://infura.io/>`_ rather than run a full Eth 1.0 client if desired.
If you do, you will need to create an account and set up a new project to obtain a project ID.
Note that Infura will limit requests after a certain threshold, so uptime is not guaranteed.

By default, the smart node will select a random Eth 2.0 client to run, in order to increase network client diversity.
You may, however, select a specific client to run if you prefer.
