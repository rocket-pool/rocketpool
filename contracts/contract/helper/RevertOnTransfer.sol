// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.30;

/// @notice Helper contract to simulate malicious node withdrawal address or withdrawal address
contract RevertOnTransfer {
    bool public enabled = true;
    address public callbackTarget;
    bytes public callbackPayload;
    uint256 public callbackCount;
    bool public callbackSucceeded;

    function setEnabled(bool _enabled) external {
        enabled = _enabled;
    }

    function setCallback(address _target, bytes calldata _payload) external {
        callbackTarget = _target;
        callbackPayload = _payload;
        callbackCount = 0;
        callbackSucceeded = false;
    }

    receive() external payable {
        require(!enabled);
        if (callbackTarget != address(0)) {
            callbackCount += 1;
            (bool success,) = callbackTarget.call(callbackPayload);
            callbackSucceeded = success;
        }
    }

    function call(address _address, bytes calldata _payload) external payable {
        (bool success,) = _address.call{value: msg.value}(_payload);
        require(success, "Failed to transfer");
    }
}
