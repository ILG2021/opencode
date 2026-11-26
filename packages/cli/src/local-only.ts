// Must stay the first import: it keeps in-process fetch, WebSocket and socket traffic on this machine.
import { installNetworkPolicy } from "@opencode/util/network-policy"
import { installSocketPolicy } from "@opencode/util/network-policy-node"

installNetworkPolicy()
installSocketPolicy()
