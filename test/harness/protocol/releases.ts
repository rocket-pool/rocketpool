import type { CurrentContracts, V131Contracts, V14Contracts } from "./contracts";
import { DepositPoolActions, DepositPoolActionsV14 } from "./domains/deposit-pool";
import { NodeDistributorActions } from "./domains/distributors";
import { MinipoolActions131, MinipoolActionsBase } from "./domains/minipools";
import { MegapoolActions } from "./domains/megapools";
import { NodeActions131, NodeActionsV14 } from "./domains/nodes";
import { ODAOActions, ODAOActionsV14 } from "./domains/odao";
import { NetworkActions, NetworkActionsV14 } from "./domains/network";
import { PDAOActions, PDAOActionsCurrent, PDAOActionsV14 } from "./domains/pdao";
import { TimeActions } from "./domains/time";
import { TokenActions } from "./domains/tokens";
import { AuctionActions } from "./domains/auctions";
import { RewardActions } from "./domains/rewards";
import { ActiveProtocolView } from "./view";

export class ProtocolV131 extends ActiveProtocolView<"1.3.1", V131Contracts> {
    readonly release = "1.3.1" as const;
    readonly pdao = new PDAOActions<V131Contracts>(this);
    readonly odao = new ODAOActions<V131Contracts>(this);
    readonly network = new NetworkActions<V131Contracts>(this);
    readonly nodes = new NodeActions131(this);
    readonly depositPool = new DepositPoolActions<V131Contracts>(this);
    readonly minipools = new MinipoolActions131(this);
    readonly tokens = new TokenActions<V131Contracts>(this);
    readonly auctions = new AuctionActions<V131Contracts>(this);
    readonly time = new TimeActions<V131Contracts>(this);

    upgradeTo(target: "1.4"): Promise<ProtocolV14>;
    upgradeTo(target: "current"): Promise<ProtocolCurrent>;
    upgradeTo(target: "1.4" | "current"): Promise<ProtocolV14 | ProtocolCurrent> {
        return target === "1.4"
            ? this.context.upgradeFrom(this, "1.4")
            : this.context.upgradeFrom(this, "current");
    }
}

export class ProtocolV14 extends ActiveProtocolView<"1.4", V14Contracts> {
    readonly release = "1.4" as const;
    readonly pdao = new PDAOActionsV14<V14Contracts>(this);
    readonly odao = new ODAOActionsV14<V14Contracts>(this);
    readonly network = new NetworkActionsV14<V14Contracts>(this);
    readonly nodes = new NodeActionsV14<V14Contracts>(this);
    readonly distributors = new NodeDistributorActions<V14Contracts>(this);
    readonly depositPool = new DepositPoolActionsV14<V14Contracts>(this);
    readonly minipools = new MinipoolActionsBase<V14Contracts>(this);
    readonly megapools = new MegapoolActions<V14Contracts>(this);
    readonly tokens = new TokenActions<V14Contracts>(this);
    readonly auctions = new AuctionActions<V14Contracts>(this);
    readonly rewards = new RewardActions<V14Contracts>(this);
    readonly time = new TimeActions<V14Contracts>(this);

    upgradeTo(target: "current"): Promise<ProtocolCurrent> {
        return this.context.upgradeFrom(this, target);
    }
}

export class ProtocolCurrent extends ActiveProtocolView<"current", CurrentContracts> {
    readonly release = "current" as const;
    readonly pdao = new PDAOActionsCurrent(this);
    readonly odao = new ODAOActionsV14<CurrentContracts>(this);
    readonly network = new NetworkActionsV14<CurrentContracts>(this);
    readonly nodes = new NodeActionsV14<CurrentContracts>(this);
    readonly distributors = new NodeDistributorActions<CurrentContracts>(this);
    readonly depositPool = new DepositPoolActionsV14<CurrentContracts>(this);
    readonly minipools = new MinipoolActionsBase<CurrentContracts>(this);
    readonly megapools = new MegapoolActions<CurrentContracts>(this);
    readonly tokens = new TokenActions<CurrentContracts>(this);
    readonly auctions = new AuctionActions<CurrentContracts>(this);
    readonly rewards = new RewardActions<CurrentContracts>(this);
    readonly time = new TimeActions<CurrentContracts>(this);
}

export interface ProtocolByRelease {
    "1.3.1": ProtocolV131;
    "1.4": ProtocolV14;
    current: ProtocolCurrent;
}

export type ProtocolView = ProtocolByRelease[keyof ProtocolByRelease];
