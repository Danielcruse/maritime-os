// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AnchorRegistry} from "../src/AnchorRegistry.sol";

/// Deploys the permissionless immutable AnchorRegistry.
/// The deployer pays deployment gas but receives no owner or submitter powers.
/// Usage: CHAIN_DEPLOYER_PRIVATE_KEY=<key> forge script script/Deploy.s.sol:DeployAnchorRegistry --rpc-url <url> --broadcast
contract DeployAnchorRegistry is Script {
    function run() external returns (AnchorRegistry) {
        uint256 deployerPrivateKey = vm.envUint("CHAIN_DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        AnchorRegistry registry = new AnchorRegistry();
        vm.stopBroadcast();

        console.log("Permissionless AnchorRegistry deployed at:", address(registry));
        console.log("Deployer (no protocol privileges):", vm.addr(deployerPrivateKey));
        return registry;
    }
}
