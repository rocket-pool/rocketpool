pragma solidity 0.7.6;

// SPDX-License-Identifier: GPL-3.0-only

// Helper contract to simulate malicious node withdrawal address or withdrawal address
contract RevertOnTransfer {
    bool public enabled = true;

    function setEnabled(bool _enabled) external {
        enabled = _enabled;
    }

    fallback() external payable {
        require(!enabled);
    }

    function call(address _address, bytes calldata _payload) external payable {
        _address.call{value: msg.value}(_payload);
    }
}