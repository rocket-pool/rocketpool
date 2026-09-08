import type { Signer } from "ethers";

import { ethers, network } from "../../test-old/_utils/hardhat-runtime";
import { getActiveAddress } from "./deployment";
import type { ProtocolView } from "./protocol";
import type { LogicalContractName } from "./releases/contracts";

const IMPERSONATED_ACCOUNT_BALANCE = "0x56bc75e2d63100000";

export async function withImpersonatedSigner<T>(
    address: string,
    callback: (signer: Signer) => Promise<T>,
): Promise<T> {
    let impersonating = false;
    try {
        await network.provider.send("hardhat_impersonateAccount", [address]);
        impersonating = true;
        await network.provider.send("hardhat_setBalance", [address, IMPERSONATED_ACCOUNT_BALANCE]);
        return await callback(await ethers.getSigner(address));
    } finally {
        if (impersonating) {
            await network.provider.send("hardhat_stopImpersonatingAccount", [address]);
        }
    }
}

export async function asNetworkContract<T>(
    protocol: ProtocolView,
    contractName: LogicalContractName,
    callback: (signer: Signer) => Promise<T>,
): Promise<T> {
    protocol.assertActive();
    const address = getActiveAddress(protocol.context.deployment, contractName);
    return withImpersonatedSigner(address, callback);
}
